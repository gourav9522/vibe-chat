import os
import requests
from fastapi import FastAPI, Request, Response
import uvicorn

app = FastAPI()

BOT_TOKEN = os.getenv("BOT_TOKEN")
RENDER_EXTERNAL_URL = os.getenv("RENDER_EXTERNAL_URL")  # Render khud de deta hai

TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"
TELEGRAM_FILE_URL = f"https://api.telegram.org/file/bot{BOT_TOKEN}"

@app.on_event("startup")
def set_webhook():
    if RENDER_EXTERNAL_URL:
        webhook_url = f"{RENDER_EXTERNAL_URL}/webhook"
        requests.get(f"{TELEGRAM_API_URL}/setWebhook?url={webhook_url}")

@app.post("/webhook")
async def telegram_webhook(request: Request):
    data = await request.json()
    
    if "message" in data:
        message = data["message"]
        chat_id = message["chat"]["id"]
        
        # Check if message contains a document, video, or audio
        file_id = None
        if "document" in message:
            file_id = message["document"]["file_id"]
        elif "video" in message:
            file_id = message["video"]["file_id"]
        elif "audio" in message:
            file_id = message["audio"]["file_id"]
            
        if file_id:
            # Get file path from Telegram
            file_path_res = requests.get(f"{TELEGRAM_API_URL}/getFile?file_id={file_id}").json()
            if file_path_res.get("ok"):
                file_path = file_path_res["result"]["file_path"]
                direct_download_link = f"{RENDER_EXTERNAL_URL}/download/{file_path}"
                
                # Send back the direct link to user
                reply_text = f"🔥 **Direct Download Link Ready!**\n\n[Click Here to Download]({direct_download_link})"
                requests.post(f"{TELEGRAM_API_URL}/sendMessage", json={
                    "chat_id": chat_id,
                    "text": reply_text,
                    "parse_mode": "Markdown"
                })
                
    return {"status": "ok"}

@app.get("/download/{file_path:path}")
def proxy_download(file_path: str):
    tg_file_url = f"{TELEGRAM_FILE_URL}/{file_path}"
    # Stream the file directly from Telegram servers to the browser
    req = requests.get(tg_file_url, stream=True)
    return Response(req.iter_content(chunk_size=1024*1024), media_type=req.headers.get("content-type"))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 10000)))
