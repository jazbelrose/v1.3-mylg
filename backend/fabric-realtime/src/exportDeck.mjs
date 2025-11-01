import { GetCommand } from "@aws-sdk/lib-dynamodb";
import PDFDocument from "pdfkit";
import { TABLE_NAME, documentClient } from "./common.mjs";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const buildHtml = (objects) => {
  const elements = objects
    .map((obj, index) => {
      const baseStyle = [
        `position:absolute`,
        `left:${obj.left ?? 0}px`,
        `top:${obj.top ?? 0}px`,
        `color:${obj.fill ?? "#111827"}`,
        `font-size:${obj.fontSize ?? 18}px`,
        `font-family:${obj.fontFamily ?? "Inter"}`,
        `width:${obj.width ?? 320}px`,
      ];

      if (obj.type === "rect") {
        baseStyle.push(`background:${obj.fill ?? "transparent"}`);
        baseStyle.push(`border:2px solid ${obj.stroke ?? obj.fill ?? "#0f172a"}`);
        baseStyle.push(`height:${obj.height ?? 160}px`);
        return `<div style="${baseStyle.join(";")}"></div>`;
      }

      if (obj.type === "circle") {
        const size = (obj.radius ?? 64) * 2;
        baseStyle.push(`background:${obj.fill ?? "transparent"}`);
        baseStyle.push(`border-radius:50%`);
        baseStyle.push(`border:2px solid ${obj.stroke ?? obj.fill ?? "#0f172a"}`);
        baseStyle.push(`width:${size}px`);
        baseStyle.push(`height:${size}px`);
        return `<div style="${baseStyle.join(";")}"></div>`;
      }

      if (obj.type === "i-text") {
        return `<div style="${baseStyle.join(";")}">${obj.text ?? ""}</div>`;
      }

      return `<div style="${baseStyle.join(";")}">${obj.type ?? "object"} #${index}</div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<meta charset="utf-8" />
<title>Fabric Deck Export</title>
<style>
  body { font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; }
  .canvas { position: relative; width: 1280px; height: 720px; margin: 32px auto; background: #f9fafb; border: 1px solid #e5e7eb; }
</style>
<body>
  <div class="canvas">${elements}</div>
</body>
</html>`;
};

const renderPdf = async (documentId, objects, version) => {
  const pdf = new PDFDocument({ size: "A4", margin: 36 });
  const chunks = [];

  pdf.on("data", (chunk) => chunks.push(chunk));

  pdf.font("Helvetica-Bold").fontSize(20).text(`Deck: ${documentId}`);
  pdf.moveDown();
  pdf.font("Helvetica").fontSize(12).text(`Version: ${version}`);
  pdf.moveDown();

  objects.forEach((obj) => {
    if (obj.type === "i-text") {
      pdf
        .font(obj.fontFamily ?? "Helvetica")
        .fontSize(obj.fontSize ?? 18)
        .fillColor(obj.fill ?? "#111827")
        .text(obj.text ?? "", {
          indent: 12,
          width: 520,
        })
        .moveDown(0.5);
    } else if (obj.type === "rect") {
      pdf
        .save()
        .lineWidth(2)
        .fillColor(obj.fill ?? "#e0e7ff")
        .strokeColor(obj.stroke ?? obj.fill ?? "#1d4ed8")
        .rect(pdf.x, pdf.y, obj.width ?? 220, obj.height ?? 120)
        .fillAndStroke();
      pdf.moveDown(0.5);
    } else if (obj.type === "circle") {
      const radius = obj.radius ?? 60;
      pdf
        .save()
        .lineWidth(2)
        .fillColor(obj.fill ?? "#ccfbf1")
        .strokeColor(obj.stroke ?? obj.fill ?? "#0f766e")
        .circle(pdf.x + radius, pdf.y + radius, radius)
        .fillAndStroke();
      pdf.moveDown(0.5);
    }
  });

  pdf.end();

  await new Promise((resolve) => pdf.on("end", resolve));

  const buffer = Buffer.concat(chunks);
  return buffer.toString("base64");
};

export const handler = async (event) => {
  const documentId = event?.pathParameters?.documentId;
  if (!documentId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: "documentId is required" }),
    };
  }

  try {
    const record = await documentClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: `DOCUMENT#${documentId}`, sk: "STATE" },
      })
    );

    const rawState = record.Item?.state;
    if (!rawState) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: "No canvas state found" }),
      };
    }

    const stateObject = typeof rawState === "string" ? JSON.parse(rawState) : rawState;
    const objects = Array.isArray(stateObject?.objects) ? stateObject.objects : [];
    const version = record.Item?.version ?? Date.now();

    const pdfBase64 = await renderPdf(documentId, objects, version);
    const html = buildHtml(objects);

    return {
      statusCode: 200,
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentId,
        version,
        pdfBase64,
        html,
        objectCount: objects.length,
      }),
    };
  } catch (error) {
    console.error("Failed to export canvas", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Failed to export canvas" }),
    };
  }
};
