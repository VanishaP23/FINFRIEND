PUT YOUR SOURCE PDFs HERE.

This folder holds the documents the RAG searches over. Two small sample PDFs
(SEBI_investor_basics.pdf, NCFE_money_management.pdf) are included so you can
test immediately. Replace them with the real SEBI / NCFE investor-education
PDFs for the demo.

Use TEXT-BASED PDFs (ones where you can select the text). Scanned/image-only
PDFs would need OCR, which this pipeline does not do.

After adding or changing PDFs, rebuild the index once:

    python ingest.py

That reads every PDF here, splits it into chunks, embeds them with a local
model, and writes the searchable index into  ../chroma_db/ .
