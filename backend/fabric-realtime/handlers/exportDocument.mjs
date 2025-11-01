import PDFDocument from "pdfkit";
import { fetchDocument, makeDocumentId, parseBody, respond } from "./shared.mjs";

const buildPdfDataUri = snapshot =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks = [];

    doc.on("data", chunk => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const base64 = buffer.toString("base64");
      resolve({
        dataUri: `data:application/pdf;base64,${base64}`,
        fileName: "canvas-export.pdf",
      });
    });

    doc.font("Helvetica-Bold").fontSize(20).text("Project Canvas", { align: "center" });
    doc.moveDown();

    const objects = Array.isArray(snapshot?.objects) ? snapshot.objects : [];
    if (!objects.length) {
      doc.font("Helvetica").fontSize(12).fillColor("#555555").text("Canvas is empty.");
    } else {
      objects.forEach((object, index) => {
        const text = typeof object?.text === "string" ? object.text : null;
        const caption = typeof object?.caption === "string" ? object.caption : null;
        const heading = text || caption || `Layer ${index + 1}`;
        doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827").text(heading);
        if (text && caption && caption !== text) {
          doc.font("Helvetica").fontSize(12).fillColor("#334155").text(caption);
        }
        doc.moveDown(0.6);
      });
    }

    doc.end();
  });

const buildStaticSiteDataUri = snapshot => {
  const objects = Array.isArray(snapshot?.objects) ? snapshot.objects : [];
  const sections = objects
    .map(object => {
      const text = typeof object?.text === "string" ? object.text : "Untitled";
      const caption = typeof object?.caption === "string" ? object.caption : "";
      return `<section class="block"><h2>${text}</h2>${caption ? `<p>${caption}</p>` : ""}</section>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>Canvas Export</title><style>body{font-family:Inter,system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;padding:40px;}section.block{background:rgba(15,23,42,0.6);border-radius:20px;padding:32px;margin-bottom:24px;border:1px solid rgba(148,163,184,0.2);}h2{margin:0 0 12px;font-size:24px;color:#f8fafc;}p{margin:0;color:#cbd5f5;font-size:16px;line-height:1.6;}</style></head><body>${sections || '<section class="block"><h2>Empty Canvas</h2><p>No objects to render.</p></section>'}</body></html>`;

  const buffer = Buffer.from(html, "utf-8");
  return {
    dataUri: `data:text/html;base64,${buffer.toString("base64")}`,
    fileName: "canvas-export.html",
  };
};

export const handler = async event => {
  try {
    const { projectId, pageId } = event?.pathParameters || {};
    if (!projectId || !pageId) {
      return respond(400, { message: "Missing projectId/pageId" });
    }

    const body = parseBody(event);
    const format = body.format || "pdf";
    const documentId = event.headers?.["x-fabric-document-id"] || makeDocumentId(projectId, pageId);
    const document = await fetchDocument(documentId);

    if (!document) {
      return respond(404, { message: "Document not found" });
    }

    if (format === "static-site") {
      const payload = buildStaticSiteDataUri(document.snapshot || {});
      return respond(200, {
        ...payload,
        format,
        documentId,
      });
    }

    const payload = await buildPdfDataUri(document.snapshot || {});
    return respond(200, {
      ...payload,
      format: "pdf",
      documentId,
    });
  } catch (err) {
    console.error("Failed to export fabric document", err);
    return respond(500, { message: "Export failed" });
  }
};
