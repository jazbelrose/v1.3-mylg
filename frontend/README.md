🛠️ MYLG! App (Making You Look Good)

The MYLG! App is a collaborative project management platform designed for designers, builders, and clients to plan, present, and execute projects seamlessly. Built with React, TypeScript, AWS Amplify, and WebSockets, it combines structured project management tools with real-time communication and visually intuitive design.

✨ Features

- **Global Search**: Unified search across projects and messages with keyboard navigation
- **Projects & Budgets**: Structured project pages with timeline, budget, and floorplans

Structured project pages with timeline, budget, and floorplans

Auto-generated element IDs and budget line tracking (with payment terms, PO, and invoice support)

File upload/download (CSV, floorplans, user assets)

Messaging & Collaboration

Real-time WebSocket messaging with optimistic UI

Project threads and direct messages

Notifications with deduplication logic

Role-based access (Admin, CEO, CTO, Designers, Clients, Workers)

Interactive Tools

Calendar integration for task planning and time-blocking

Fabric.js collaborative canvas for briefs, deck pages, and moodboards with real-time sync

Support for voice notes and (planned) voice recognition

Architecture

Frontend: React + TypeScript + custom Webpack/Vite setup

Backend: AWS Amplify, DynamoDB, API Gateway WebSocket, Lambda functions

Auth: AWS Cognito with role claims injected at token issuance

Storage: Amazon S3 for files and assets

🚀 Roadmap

Multi-user calendar sharing and task scheduling

AI-assisted design chat (exploring GPT-J via AWS Bedrock)

Improved rendering workflows for 2D/3D assets

## 📖 Technical Documentation

### Fabric Canvas System
For detailed technical information about the Fabric-powered real-time canvas:

- **[Fabric Canvas Architecture](./FABRIC_CANVAS_ARCHITECTURE.md)** - Design notes covering DynamoDB persistence, WebSocket fan-out, and export services
- **[Canvas Flow Diagrams](./FABRIC_CANVAS_DIAGRAMS.md)** - Visual diagrams showing data flow, component relationships, and system architecture
- **[Canvas Summary](./FABRIC_CANVAS_SUMMARY.md)** - Executive summary with actionable recommendations and implementation roadmap

### Key Technical Features
- **Real-time Collaboration**: Serverless WebSockets fan-out with optimistic Fabric snapshots
- **Multi-layer Persistence**: DynamoDB-backed snapshots with HTTP sync + client-side caching
- **Performance Optimization**: Debounced snapshot writes and selective object updates
- **Security**: JWT authentication for WebSocket connections (planned improvements)
- **Scalability**: Architecture supports 100+ concurrent users per document