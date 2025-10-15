"""
createGalleryFunction handler copied from projects service. Keep dependencies in `requirements.txt`.
"""
import json
import os
import re
import base64
import uuid
from io import BytesIO
import boto3
from boto3.dynamodb.conditions import Key, Attr
from urllib.parse import unquote
from botocore.config import Config
import fitz  # PyMuPDF


from decimal import Decimal

def convert_floats_to_decimals(obj):
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, list):
        return [convert_floats_to_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimals(v) for k, v in obj.items()}
    else:
        return obj


s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
galleries_table = dynamodb.Table(os.environ.get('GALLERIES_TABLE', 'Galleries'))
connections_table = dynamodb.Table(os.environ.get('CONNECTIONS_TABLE', 'Connections'))


def mgmt_endpoint():
    # Read from env and normalize exactly once
    raw = (os.environ.get('WEBSOCKET_ENDPOINT') or '').strip()
    if not raw:
        return None
    # Convert wss:// to https:// if someone set the WSS URL by mistake
    if raw.startswith('wss://'):
        raw = 'https://' + raw[len('wss://'):]
    # Remove accidental double scheme like https://https://
    if raw.startswith('https://https://'):
        raw = raw[len('https://'):]
    # Ensure https:// prefix
    if not raw.startswith('https://'):
        raw = 'https://' + raw.lstrip('/')
    return raw.rstrip('/')


MGMT = mgmt_endpoint()
apigw = None
if MGMT:
    apigw = boto3.client(
        'apigatewaymanagementapi',
        endpoint_url=MGMT,
        config=Config(connect_timeout=3, read_timeout=3, retries={'max_attempts': 2, 'mode': 'standard'})
    )


def post_ws(connection_id: str, payload: dict):
    if not apigw:
        print('WEBSOCKET_ENDPOINT not configured; skipping broadcast')
        return False
    # If your DB stored a URL-encoded ID, decode it
    cid = unquote(connection_id)
    body = json.dumps(payload).encode('utf-8')
    try:
        apigw.post_to_connection(ConnectionId=cid, Data=body)
        return True
    except apigw.exceptions.GoneException:
        # client disconnected — caller should remove this connectionId from the table
        print(f'WS Gone: {cid}')
        return 'gone'
    except Exception as e:
        print(f'WS send error: {e}')
        return False

IMAGE_PATTERN = re.compile(r'<image(?P<attributes>[^>]*)xlink:href="data:image/(?P<type>[^;]+);base64,(?P<data>[^"]+)"(?:\s*/>)?')

def extract_images(svg_content, base_path, bucket):
    matches = list(IMAGE_PATTERN.finditer(svg_content))
    counter = 1
    urls = []
    for match in matches:
        full = match.group(0)
        attrs = match.group('attributes').rstrip()
        if attrs.endswith('/'):
            attrs = attrs[:-1].rstrip()
        ext = match.group('type').lower()
        data_b64 = match.group('data')
        filename = f"exported_image_{counter}.{ext}"
        key = f"{base_path}/images/{filename}"
        content_type = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=base64.b64decode(data_b64),
            ContentType=content_type
        )
        url = f"https://{bucket}.s3.amazonaws.com/{key}"
        new_tag = f'<image{attrs} xlink:href="{url}" />'
        svg_content = svg_content.replace(full, new_tag, 1)
        urls.append(url)
        counter += 1
    return svg_content, urls


def process_pdf(pdf_bytes, base_path, bucket):
    print(f"[process_pdf] opening PDF bytes={len(pdf_bytes)}")
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    print(f"[process_pdf] PDF has {len(doc)} pages")
    counter, urls, image_map = 1, [], []
    page_image_urls = []

    for pno, page in enumerate(doc, start=1):
        images = page.get_images(full=True)
        print(f"[process_pdf] page {pno}: {len(images)} images found")
        for img in images:
            xref = img[0]
            print(f"[process_pdf]  – image xref={xref}")
            info = doc.extract_image(xref)
            ext = info.get("ext", "png")
            img_bytes = info["image"]
            print(f"[process_pdf]    extracted {len(img_bytes)} bytes, ext={ext}")

            filename = f"exported_image_{counter}.{ext}"
            key = f"{base_path}/images/{filename}"
            print(f"[process_pdf]    uploading to s3://{bucket}/{key}")
            s3.put_object(Bucket=bucket, Key=key, Body=img_bytes, ContentType=f"image/{ext}")
            url = f"https://{bucket}.s3.amazonaws.com/{key}"
            urls.append(url)

            rects = page.get_image_rects(xref)
            print(f"[process_pdf]    {len(rects)} rect(s) for link overlay")
            for rect in rects:
                page.insert_link({"kind": fitz.LINK_URI, "from": rect, "uri": url})
                entry = {
                    "url": url,
                    "page": pno,
                    "rect": list(rect)
                }
                image_map.append(entry)

            counter += 1

        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        page_key = f"{base_path}/pages/page_{pno}.jpg"
        s3.put_object(
            Bucket=bucket,
            Key=page_key,
            Body=pix.tobytes("jpg"),
            ContentType="image/jpeg",
        )
        page_image_urls.append(f"https://{bucket}.s3.amazonaws.com/{page_key}")

    print("[process_pdf] saving updated PDF…")
    buf = BytesIO()
    doc.save(buf, deflate=True, garbage=4)
    doc.close()
    return buf.getvalue(), urls, image_map, page_image_urls


def broadcast_to_conversation(conversation_id, payload):
    try:
        data = connections_table.scan().get('Items', [])
        recipients = [c for c in data if (c.get('activeConversation') or '').strip() == conversation_id.strip()]
        stale = []
        for conn in recipients:
            cid = conn.get('connectionId')
            if not cid:
                continue
            res = post_ws(cid, payload)
            if res == 'gone':
                stale.append(cid)
            elif res is True:
                print(f'WS send succeeded for {cid}')
        for cid in stale:
            try:
                connections_table.delete_item(Key={'connectionId': cid})
            except Exception:
                pass
    except Exception as e:
        print('broadcast_to_conversation error', e)


def process_request(body, cors_headers):

    project_id = body.get('projectId')
    gallery_name = body.get('galleryName', 'Gallery')
    gallery_slug = body.get('gallerySlug')
    gallery_password = body.get('galleryPassword')
    password_enabled = body.get('passwordEnabled', bool(gallery_password))
    password_timeout = body.get('passwordTimeout', 15 * 60 * 1000)
    svg_key = body.get('svgKey')
    svg_data = body.get('svgData')
    pdf_key = body.get('pdfKey')
    pdf_data = body.get('pdfData')

    if not project_id or not (svg_key or svg_data or pdf_key or pdf_data):
        return {
            'statusCode': 400,
            'headers': cors_headers,
            'body': json.dumps({'message': 'projectId and svg/pdf data required'})
        }

    bucket = os.environ.get('SOURCE_BUCKET', 'mylg-files-v12')
    if gallery_slug:
        try:
            res = galleries_table.query(
                IndexName='projectId-index',
                KeyConditionExpression=Key('projectId').eq(project_id),
                FilterExpression=Attr('slug').eq(gallery_slug),
                Limit=1
            )
            if res.get('Items'):
                return {
                    'statusCode': 409,
                    'headers': cors_headers,
                    'body': json.dumps({'message': 'Slug already exists'})
                }
        except Exception as e:
            print('Slug collision check failed', e)

    gallery_id = str(uuid.uuid4())
    base_path = f"projects/{project_id}/gallery/{gallery_slug or gallery_id}"

    image_urls = []
    updated_svg_key = None
    updated_pdf_key = None
    all_image_map = []
    page_image_urls = []

    if svg_key or svg_data:
        if svg_key:
            obj = s3.get_object(Bucket=bucket, Key=svg_key)
            svg_content = obj['Body'].read().decode('utf-8')
        else:
            svg_content = base64.b64decode(svg_data).decode('utf-8')
        svg_content, image_urls = extract_images(svg_content, base_path, bucket)
        updated_svg_key = f"{base_path}/design-board-updated.svg"
        s3.put_object(Bucket=bucket, Key=updated_svg_key, Body=svg_content.encode('utf-8'), ContentType='image/svg+xml')
        orig_svg_key_out = f"{base_path}/design-board-original.svg"
        if svg_key:
            s3.copy_object(Bucket=bucket, CopySource={'Bucket': bucket, 'Key': svg_key}, Key=orig_svg_key_out, ContentType='image/svg+xml')
        else:
            s3.put_object(Bucket=bucket, Key=orig_svg_key_out, Body=base64.b64decode(svg_data), ContentType='image/svg+xml')

    if pdf_key or pdf_data:
        if pdf_key:
            obj = s3.get_object(Bucket=bucket, Key=pdf_key)
            pdf_bytes = obj['Body'].read()
        else:
            pdf_bytes = base64.b64decode(pdf_data)
        pdf_bytes_updated, pdf_image_urls, pdf_image_map, page_urls = process_pdf(pdf_bytes, base_path, bucket)
        image_urls.extend(pdf_image_urls)
        all_image_map = pdf_image_map
        page_image_urls = page_urls
        updated_pdf_key = f"{base_path}/design-board-updated.pdf"
        s3.put_object(Bucket=bucket, Key=updated_pdf_key, Body=pdf_bytes_updated, ContentType='application/pdf')
        orig_pdf_key_out = f"{base_path}/design-board-original.pdf"
        if pdf_key:
            s3.copy_object(Bucket=bucket, CopySource={'Bucket': bucket, 'Key': pdf_key}, Key=orig_pdf_key_out, ContentType='application/pdf')
        else:
            s3.put_object(Bucket=bucket, Key=orig_pdf_key_out, Body=base64.b64decode(pdf_data), ContentType='application/pdf')

    password_hash = ''
    if gallery_password:
        import hashlib
        password_hash = hashlib.sha256(gallery_password.encode()).hexdigest()

    gallery_version = 2 if page_image_urls else 1
    gallery_entry = {
        'galleryId': gallery_id,
        'projectId': project_id,
        'name': gallery_name,
        'imageUrls': image_urls,
        'imageMap': all_image_map,
        'pageImageUrls': page_image_urls,
        'galleryVersion': gallery_version,
        'passwordEnabled': bool(password_enabled),
        'passwordTimeout': int(password_timeout),
    }
    if updated_svg_key:
        gallery_entry['updatedSvgUrl'] = f"https://{bucket}.s3.amazonaws.com/{updated_svg_key}"
        gallery_entry['originalSvgUrl'] = f"https://{bucket}.s3.amazonaws.com/{orig_svg_key_out}"
    if updated_pdf_key:
        gallery_entry['updatedPdfUrl'] = f"https://{bucket}.s3.amazonaws.com/{updated_pdf_key}"
        gallery_entry['originalPdfUrl'] = f"https://{bucket}.s3.amazonaws.com/{orig_pdf_key_out}"
    if gallery_slug:
        gallery_entry['slug'] = gallery_slug
    if gallery_password:
        gallery_entry['password'] = gallery_password
    if password_hash:
        gallery_entry['passwordHash'] = password_hash

    if pdf_key:
        gallery_entry['originalPdfUrl'] = f"https://{bucket}.s3.amazonaws.com/{pdf_key}"

    gallery_entry = convert_floats_to_decimals(gallery_entry)

    print("DEBUG: gallery_entry =")
    print(json.dumps(gallery_entry, indent=2, default=str))

    try:
        galleries_table.put_item(Item=gallery_entry)
    except Exception as e:
        print('Failed to save gallery to table', e)
    broadcast_to_conversation(
    f'project#{project_id}',
    {
        'action': 'galleryCreated',
        'projectId': project_id,
        'galleryId': gallery_id,
        'name': gallery_name,
    }
    )

    body_resp = {
        'galleryId': gallery_id,
        'slug': gallery_slug,
        'imageUrls': image_urls,
        'imageMap': all_image_map,
        'pageImageUrls': page_image_urls,
        'galleryVersion': gallery_version,
    }
    if updated_svg_key:
        body_resp['updatedSvgUrl'] = gallery_entry['updatedSvgUrl']
        body_resp['originalSvgUrl'] = gallery_entry['originalSvgUrl']
    if updated_pdf_key:
        body_resp['updatedPdfUrl'] = gallery_entry['updatedPdfUrl']
        body_resp['originalPdfUrl'] = gallery_entry['originalPdfUrl']
    if pdf_key:
        body_resp['originalPdfUrl'] = gallery_entry['originalPdfUrl']


    return {
        'statusCode': 200,
        'headers': cors_headers,
        'body': json.dumps(body_resp)
    }


def lambda_handler(event, context):
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }

    if 'Records' in event:
        record = event['Records'][0]
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']
        obj = s3.get_object(Bucket=bucket, Key=key)
        meta = obj.get('Metadata', {})
        body = {
            'projectId': meta.get('projectid'),
            'galleryName': meta.get('galleryname', os.path.basename(key)),
            'gallerySlug': meta.get('galleryslug'),
            'galleryPassword': meta.get('gallerypassword'),
            'passwordEnabled': meta.get('passwordenabled', 'true'),
            'passwordTimeout': int(meta.get('passwordtimeout', '900000')),
        }
        if key.lower().endswith('.pdf'):
            body['pdfKey'] = key
        else:
            body['svgKey'] = key
        return process_request(body, cors_headers)

    print("Incoming event.body:", event.get("body"))
    method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method")
    if method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({"message": "CORS preflight"}),
        }

    try:
        body = json.loads(event.get('body', '{}'))
    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'headers': cors_headers,
            'body': json.dumps({'message': 'Invalid JSON'})
        }

    return process_request(body, cors_headers)
