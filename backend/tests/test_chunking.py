from app.ingestion import chunk_pages

def test_chunk_pages_returns_text():
    chunks = chunk_pages([(1, "hello world " * 150)])
    assert chunks
    assert all(text for _, text in chunks)
    assert chunks[0][0] == 1
