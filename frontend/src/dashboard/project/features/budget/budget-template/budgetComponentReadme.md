BudgetComponent ( IN PROGRESS )

A professional React component for modern budget management and real-time financial oversight within production and event projects.

Overview
BudgetComponent gives producers and project managers a clear, interactive, and up-to-date picture of budget health—at a glance.
It provides fast data entry, live summary stats, and robust import/editing tools for the most demanding budgeting workflows.

Key Features
📊 Summary Stat Cards (Always Visible)
Total Budgeted: The project's planned/approved budget.

Total Raw Cost: Current sum of all line items, before markup.

Total with Markup: Grand total including all applied markups.

Live Delta Calculations: Instantly shows if you’re over/under budget, with clear visual indicators (e.g., “+$2,450 Over Budget” in red).

➕ Add & Edit Budget Line Items
Simple, serious “Add Line Item” flow (modal or form)

Auto-generation of:

Element ID: {CATEGORY}-000X, unique per category, never reused, admin-resettable

Element Key: {PROJECT_CODE}-000X, unique per project, sequential, never reused

📂 Excel Import & Visualization
Drag-and-drop .xlsx or .xls file upload

Extracts categories and costs, validates headers

Displays imported data in a bar chart for instant feedback

💵 Payment Tracking
Payment fields: Vendor Invoice #, PO # (optional)

Payment Terms: NET 15, NET 30, NET 60, DUE ON RECEIPT (required)

Payment Status: PAID, PARTIAL, UNPAID (required, color-tagged: green/yellow/red)

Editable fields with optional audit trail

🔄 Real-Time Synchronization
All edits and updates are sent to the backend API and broadcast via WebSocket, keeping all users on the same page instantly

Example Usage
jsx
Copy
Edit
import BudgetComponent from './BudgetComponent';

budget-dynamo-template.csv for dev

How It Works
See Budget Health at a Glance:
Stat cards at the top display all key totals, with live delta (over/under) and color-coded highlights.

Add or Edit Items:
Use the “Add Line Item” button for quick entry. IDs/Keys are generated for compliance.

Bulk Import:
Upload an Excel file for rapid population—see errors or chart results immediately.

Track and Update Payments:
All key payment data is editable and tracked, with clear visual status.

Always Current:
All changes update instantly for all users, thanks to integrated API and WebSocket logic.

Props
Prop Name	Type	Description
budget	object	Project budget data (total, date, etc.)
activeProject	object	Current project object (must include projectId)

Dependencies
React

XLSX (SheetJS) (Excel parsing)

Recharts (charts/visualization)

lucide-react (icons)

REST API
Budget data is stored in DynamoDB and managed via the `budgets-crud-stack` Lambda.
Key endpoints include:

- `GET /projects/{projectId}/budgets/{budgetId}` – list budget items
- `POST /projects/{projectId}/budgets/{budgetId}/items` – add an item
- `PUT /projects/{projectId}/budgets/{budgetId}/items/{budgetItemId}` – update an item
- `DELETE /projects/{projectId}/budgets/{budgetId}/items/{budgetItemId}` – delete an item

Notes
Stat card UI is easily extensible; add or style as needed for your use case.

ID/key logic should also be validated on the backend for full reliability.

Handles missing/invalid uploads with clear error messaging.

License
MIT (or specify license)

Maintained by [Your Company or Name].
Questions? Suggestions? Open an issue or reach out.








