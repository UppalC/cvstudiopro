# Tests

Unit tests (no install needed, Node 18+):

    node --test tests/*.test.js

Browser integration tests (import + Word export; needs Python, `pip install playwright python-docx pillow`, LibreOffice and poppler-utils):

    python3 tests/e2e_builder.py

Rule for new work: write the test first, see it fail, then write the code (TDD).
Not covered: real Microsoft Word on a real PC/phone (tested with python-docx and LibreOffice only).
