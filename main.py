import os
import httpx
import uvicorn
from fastapi import FastAPI

app = FastAPI()

# 1. Dit is de functie die het seintje STUURT
def stuur_seintje_en_wacht():
    print("[Railway] Ik ga nu een seintje sturen...")
    
    # VERVANG DIT door het adres van het andere systeem
    andere_website_url = "https://genesyswfm.hosting.corp/wfm/Login.jsp"
    
    data_pakketje = {
        "bericht": "Ping! Stuur dit seintje direct terug naar Railway."
    }
    
    try:
        httpx.post(andere_website_url, json=data_pakketje)
        print("[Railway] Seintje is verstuurd! Ik wacht tot hij terugkomt...")
    except Exception as e:
        print(f"[Railway] Oeps, sturen mislukt: {e}")

# 2. Dit is de brievenbus waar het seintje weer TERUG ONTVANGT
@app.post("/brievenbus-terug")
def seintje_terug_ontvangen(data: dict):
    print("[Railway] PONG! Ik heb het seintje succesvol terugontvangen!")
    return {"status": "success", "message": "Seintje ontvangen!"}

if __name__ == "__main__":
    import threading
    threading.Thread(target=stuur_seintje_en_wacht).start()
    
    # We zetten hem hier hard op poort 8080 zodat hij matcht met je c213 link!
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
