import os
import requests
from fastapi import FastAPI, Response
import uvicorn

app = FastAPI()

BOT_TOKEN = "8953260237:AAGeFUzkNOzhQ8dthA00K81cgXwI8ZqkY90"
TARGET_CHAT_ID = "-1003935579226"
RENDER_EXTERNAL_URL = os.getenv("RENDER_EXTERNAL_URL")

TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"
TELEGRAM_FILE_URL = f"https://api.telegram.org/file/bot{BOT_TOKEN}"

@app.on_event("startup")
def set_webhook():
    if RENDER_EXTERNAL_URL:
        webhook_url = f"{RENDER_EXTERNAL_URL}/webhook"
        requests.get(f"{TELEGRAM_API_URL}/setWebhook?url={webhook_url}")

@app.post("/webhook")
async def telegram_webhook(request: dict):
    try:
        message = request.get("message", {}) or request.get("channel_post", {})
        chat_id = str(message.get("chat", {}).get("id", ""))
        
        # Sirf tere diye gaye chat/group/channel ya personal chat ki files allow karega
        if chat_id == TARGET_CHAT_ID or str(message.get("from", {}).get("id", "")) == "8953260237": # ya tera admin id
            file_id = None
            if "document" in message:
                file_id = message["document"]["file_id"]
            elif "video" in message:
                file_id = message["video"]["file_id"]
            elif "audio" in message:
                file_id = message["audio"]["file_id"]
                
            if file_id:
                file_path_res = requests.get(f"{TELEGRAM_API_URL}/getFile?file_id={file_id}").json()
                if file_path_res.get("ok"):
                    file_path = file_path_res["result"]["file_path"]
                    direct_download_link = f"{RENDER_EXTERNAL_URL}/download/{file_path}"
                    
                    reply_text = f"🔥 **Direct Download Link Ready!**\n\n[Click Here to Download]({direct_download_link})"
                    requests.post(f"{TELEGRAM_API_URL}/sendMessage", json={
                        "chat_id": chat_id,
                        "text": reply_text,
                        "parse_mode": "Markdown"
                    })
    except Exception as e:
        print(e)
    return {"status": "ok"}

@app.get("/download/{file_path:path}")
def proxy_download(file_path: str):
    tg_file_url = f"{TELEGRAM_FILE_URL}/{file_path}"
    req = requests.get(tg_file_url, stream=True)
    return Response(req.iter_content(chunk_size=1024*1024), media_type=req.headers.get("content-type"))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 10000)))
