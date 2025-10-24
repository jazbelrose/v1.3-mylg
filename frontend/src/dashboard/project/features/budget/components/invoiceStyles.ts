export const invoiceStyles = `
  @page { margin: 0; }
  body { margin: 0; }
  .invoice-container{background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;width:min(100%,210mm);max-width:210mm;box-sizing:border-box;margin:0 auto;padding:20px;overflow-x:hidden;}
  .invoice-page{width:min(100%,210mm);max-width:210mm;min-height:297mm;box-shadow:0 2px 6px rgba(0,0,0,0.15);margin:0 auto 20px;padding:20px 20px 60px;box-sizing:border-box;position:relative;overflow-x:hidden;display:flex;flex-direction:column;}
  .invoice-header{display:flex;align-items:flex-start;gap:20px;}
  .logo-upload{width:100px;height:100px;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;}
  .logo-upload img{max-width:100%;max-height:100%;object-fit:contain;}
  .company-block{flex:1;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}
  .company-info{display:flex;flex-direction:column;margin-top:10px;}
  .brand-name{font-size:1.2rem;font-weight:bold;}
  .brand-tagline,.brand-address,.brand-phone{font-size:0.7rem;}
  .brand-toggle{font-size:0.65rem;color:#666;margin-top:4px;}
  .invoice-meta{text-align:right;font-size:0.85rem;}
  .billing-info{margin-top:20px;display:flex;justify-content:space-between;gap:20px;font-size:0.85rem;}
  .invoice-title{font-size:2rem;color:#FA3356;font-weight:bold;text-align:right;margin-left:auto;}
  .project-title{font-size:1.5rem;font-weight:bold;text-align:center;margin:10px 0;}
  .summary{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px;}
  .summary>div{flex:1;}
  .summary-divider{border:0;border-top:1px solid #ccc;margin-bottom:10px;}
  .items-table-wrapper{flex:1 0 auto;}
  .items-table{width:100%;border-collapse:collapse;margin-top:20px;box-sizing:border-box;}
  .items-table th,.items-table td{border:1px solid #ddd;padding:8px;font-size:0.85rem;text-align:left;}
  .items-table th{background:#f5f5f5;font-weight:bold;}
  .group-header td{font-weight:bold;background:#fafafa;}
  .totals{margin-top:50px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-size:0.95rem;}
  .totals div{display:flex;gap:6px;align-items:baseline;}
  .notes{margin-top:20px;font-size:0.9rem;line-height:1.5;}
  .notes p{margin:0 0 0.5rem;}
  .footer{margin-top:50px;font-size:0.9rem;color:#666;}
  .pageNumber{position:absolute;bottom:16px;left:0;right:0;text-align:center;font-family:'Roboto',Arial,sans-serif;font-size:0.85rem;color:#666;font-weight:normal;pointer-events:none;user-select:none;}
  @media print{
    .invoice-container{width:210mm;max-width:210mm;padding:20px;}
    .invoice-page{width:210mm;max-width:210mm;height:297mm;min-height:auto;box-shadow:none;margin:0;page-break-after:always;padding:20px 20px 50px;}
    .invoice-page:last-child{page-break-after:auto;}
  }
`;

export default invoiceStyles;
