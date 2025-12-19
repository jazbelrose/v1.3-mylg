#!/usr/bin/env python3
"""
File Complexity Analysis Script

Generates metrics for large files in the codebase to aid in refactoring decisions.

Usage:
    # Analyze default set of top 10 large files
    python3 docs/scripts/analyze_file_complexity.py
    
    # Analyze specific files
    python3 docs/scripts/analyze_file_complexity.py frontend/src/shared/utils/api.ts
    
    # Analyze multiple specific files
    python3 docs/scripts/analyze_file_complexity.py \
        frontend/src/shared/utils/api.ts \
        frontend/src/dashboard/features/messages/ProjectMessagesThread.tsx

The script calculates a complexity score based on:
- File size (lines of code)
- Number of exports (more = more responsibilities)
- Number of imports (more = more dependencies)
- Function density (lower = larger functions)

Higher complexity scores indicate files that are harder to maintain and should
be prioritized for refactoring.
"""

import os
import re
from pathlib import Path
from typing import Dict, List, Tuple

def count_functions(content: str, file_ext: str) -> int:
    """Count function/component definitions in a file."""
    if file_ext in ['.ts', '.tsx', '.js', '.jsx']:
        # Match function declarations, arrow functions, and const/let assignments
        patterns = [
            r'^export\s+(default\s+)?function\s+\w+',
            r'^function\s+\w+',
            r'^export\s+const\s+\w+\s*=\s*\(',  # Functions starting with (
            r'^export\s+const\s+\w+\s*=\s*[^(]', # Non-function const exports
            r'^const\s+\w+\s*:\s*React\.FC',
            r'^const\s+\w+\s*=\s*\([^)]*\)\s*=>',
        ]
        count = 0
        for pattern in patterns:
            count += len(re.findall(pattern, content, re.MULTILINE))
        return count
    return 0

def count_imports(content: str, file_ext: str) -> int:
    """Count import statements."""
    if file_ext in ['.ts', '.tsx', '.js', '.jsx']:
        return len(re.findall(r'^import\s+', content, re.MULTILINE))
    return 0

def count_exports(content: str, file_ext: str) -> int:
    """Count export statements."""
    if file_ext in ['.ts', '.tsx', '.js', '.jsx']:
        return len(re.findall(r'^export\s+', content, re.MULTILINE))
    return 0

def calculate_complexity_score(
    lines: int,
    functions: int,
    imports: int,
    exports: int
) -> float:
    """
    Calculate a complexity score.
    Higher score = more complex and harder to maintain.
    """
    # Base score from lines (normalized)
    line_score = lines / 100
    
    # Function density (functions per 100 lines)
    function_density = (functions / lines * 100) if lines > 0 else 0
    
    # Import density (more imports = more dependencies)
    import_score = imports / 10
    
    # Export score (more exports = more responsibilities)
    export_score = exports / 5
    
    # Combine scores (weighted)
    # Lower function density = larger functions (capped at 0 to avoid negative values)
    density_score = max(0, (10 - function_density)) * 0.1
    
    complexity = (
        line_score * 0.4 +
        export_score * 0.3 +
        import_score * 0.2 +
        density_score
    )
    
    return round(complexity, 2)

def analyze_file(file_path: Path, base_path: Path) -> Dict:
    """Analyze a single file and return metrics."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        lines = len(content.splitlines())
        file_ext = file_path.suffix
        
        functions = count_functions(content, file_ext)
        imports = count_imports(content, file_ext)
        exports = count_exports(content, file_ext)
        
        # Calculate average lines per function (rough estimate)
        avg_lines_per_function = round(lines / functions) if functions > 0 else 0
        
        complexity = calculate_complexity_score(lines, functions, imports, exports)
        
        return {
            'path': str(file_path.relative_to(base_path)),
            'lines': lines,
            'functions': functions,
            'imports': imports,
            'exports': exports,
            'avg_lines_per_function': avg_lines_per_function,
            'complexity_score': complexity,
        }
    except Exception as e:
        print(f"Error analyzing {file_path}: {e}")
        return None

def main():
    """Main analysis function."""
    import sys
    
    # Get the repository root (2 levels up from docs/scripts)
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent.parent
    
    # Default files to analyze (top 10 from our analysis)
    # Can be overridden by providing file paths as command-line arguments
    default_files = [
        'frontend/src/dashboard/features/messages/ProjectMessagesThread.tsx',
        'frontend/src/dashboard/home/components/QuickCreateTaskModal.tsx',
        'frontend/src/dashboard/project/features/budget/components/CreateLineItemModal.tsx',
        'frontend/src/dashboard/project/features/budget/components/InvoicePreviewContent.tsx',
        'frontend/src/shared/utils/api.ts',
        'frontend/src/dashboard/project/features/budget/components/HeaderStats.tsx',
        'frontend/src/dashboard/project/features/calendar/components/CalendarSurface.tsx',
        'frontend/src/dashboard/features/messages/Messages.tsx',
        'frontend/src/dashboard/project/components/Shared/calendar/useCalendarController.tsx',
        'frontend/src/dashboard/home/components/Collaborators.tsx',
    ]
    
    # Use command-line arguments if provided, otherwise use defaults
    if len(sys.argv) > 1:
        files_to_analyze = sys.argv[1:]
    else:
        files_to_analyze = default_files
    
    results = []
    for file_path in files_to_analyze:
        path = repo_root / file_path
        if path.exists():
            result = analyze_file(path, repo_root)
            if result:
                results.append(result)
        else:
            print(f"Warning: File not found: {file_path}")
    
    # Sort by complexity score
    results.sort(key=lambda x: x['complexity_score'], reverse=True)
    
    # Print results
    print("\n" + "="*80)
    print("FILE COMPLEXITY ANALYSIS REPORT")
    print("="*80 + "\n")
    
    print(f"{'Rank':<6}{'Complexity':<12}{'Lines':<8}{'Funcs':<8}{'Exports':<10}{'Avg/Func':<10}{'File'}")
    print("-" * 80)
    
    for i, result in enumerate(results, 1):
        print(
            f"{i:<6}"
            f"{result['complexity_score']:<12.2f}"
            f"{result['lines']:<8}"
            f"{result['functions']:<8}"
            f"{result['exports']:<10}"
            f"{result['avg_lines_per_function']:<10}"
            f"{result['path']}"
        )
    
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80 + "\n")
    
    if results:
        total_lines = sum(r['lines'] for r in results)
        total_functions = sum(r['functions'] for r in results)
        avg_complexity = sum(r['complexity_score'] for r in results) / len(results)
        
        print(f"Total lines across top 10 files: {total_lines:,}")
        print(f"Total functions/exports: {total_functions}")
        print(f"Average complexity score: {avg_complexity:.2f}")
        print(f"\nNote: Complexity score is based on file size, export count, imports, and function density.")
        print(f"Higher score = more complex and harder to maintain.\n")
    else:
        print("No files were analyzed successfully.\n")

if __name__ == '__main__':
    main()
