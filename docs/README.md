# Documentation Overview

This directory contains documentation for the v1.3-mylg project.

## Architecture Decision Records (ADRs)

ADRs document important architectural decisions made in the project. They are located in the `adrs/` directory:

- **[ADR-001: CDN File URL Strategy](adrs/ADR-001.md)** - Standardization of file URL patterns for CloudFront
- **[ADR-002: Direct Message Conversation Identifier Format](adrs/ADR-002.md)** - Canonical conversation ID format for DMs
- **[ADR-003: Centralized CORS Configuration](adrs/ADR-003.md)** - Centralized CORS management via shared layer
- **[ADR-004: Large Monolithic Files Requiring Refactoring](adrs/ADR-004.md)** - Analysis and refactoring plan for large files

## Code Quality & Maintenance

### Large Files Refactoring

The codebase contains several large monolithic files that should be broken down for better maintainability:

- **[Large Files Refactoring Guide](LARGE_FILES_REFACTORING.md)** - Quick reference for large files and refactoring patterns
- **[ADR-004](adrs/ADR-004.md)** - Detailed analysis and refactoring recommendations

**Key Findings:**
- 10 files identified over 800 lines of code
- Top file: `api.ts` with 1,115 lines and 69 exports (complexity score: 9.53)
- Total of 10,927 lines across top 10 files
- Average complexity score: 6.18 (indicating high maintenance burden)

**Run the analysis:**
```bash
# Analyze default top 10 large files
python3 docs/scripts/analyze_file_complexity.py

# Or analyze specific files
python3 docs/scripts/analyze_file_complexity.py frontend/src/shared/utils/api.ts
```

## Development Guides

- **[Dashboard Preview Guide](dev-dashboard-preview.md)** - Guide for dashboard preview features

## Utilities

The `scripts/` directory contains utility scripts for code analysis:

- **[analyze_file_complexity.py](scripts/analyze_file_complexity.py)** - Analyzes file complexity metrics

## Contributing

When making significant architectural decisions:

1. Create a new ADR in `docs/adrs/` following the existing format
2. Use the template structure from existing ADRs
3. Include: Context, Decision, Alternatives Considered, Pros/Cons, Operations/Telemetry, Implementation Plan
4. Link related ADRs and PRs

## Document Structure

```
docs/
├── README.md                          # This file
├── LARGE_FILES_REFACTORING.md         # Quick reference for refactoring
├── dev-dashboard-preview.md           # Dashboard preview guide
├── adrs/                              # Architecture Decision Records
│   ├── ADR-001.md                     # CDN File URL Strategy
│   ├── ADR-002.md                     # DM Conversation Identifier
│   ├── ADR-003.md                     # Centralized CORS
│   └── ADR-004.md                     # Large Files Refactoring
└── scripts/                           # Utility scripts
    └── analyze_file_complexity.py     # File complexity analyzer
```
