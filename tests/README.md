# Tests

Unit tests (no install needed, Node 18+). They also run the Google Apps Script backend (`apps-script/Code.gs`) against a fake Google Sheet in memory:

    node --test tests/*.test.js

Browser integration tests (need Python, `pip install playwright python-docx pillow`, LibreOffice and poppler-utils for the Word test):

    python3 tests/e2e_builder.py    # import old resume text + Word export
    python3 tests/e2e_ats.py        # ATS checker page
    python3 tests/e2e_admin.py      # admin "purge old data" button (fake backend)

Rule for new work: write the test first, see it fail, then write the code (TDD).
Not covered: real Microsoft Word on a real PC/phone; the real deployed Apps Script and Google Sheet; real phones.
