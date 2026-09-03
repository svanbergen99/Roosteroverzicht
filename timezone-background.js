(() => {
  "use strict";
  const TIME_ZONE = "Europe/Amsterdam";
  const SEASON = { spring:"Lente.jpg", summer:"Zomer.jpg", autumn:"Herfst.jpg", winter:"Winter.jpg" };
  const ALPHA = {"Lente.jpg":.73,"Zomer.jpg":.70,"Herfst.jpg":.75,"Winter.jpg":.77,"Halloween.jpg":.72,"Kerst.jpg":.73,"Koningsdag.jpg":.72,"Moederdag.jpg":.74,"Nieuwjaar.jpg":.71,"Oudjaar.jpg":.71,"Pasen.jpg":.73,"Suikerfeest.jpg":.72,"Vaderdag.jpg":.74,"Valentijns.jpg":.73,"sinterklaas.jpg":.73};
  const EID = {2026:"2026-03-20",2027:"2027-03-10",2028:"2028-02-27",2029:"2029-02-15",2030:"2030-02-05",2031:"2031-01-25"};

  function parts() {
    const p = new Intl.DateTimeFormat("en-CA", {timeZone:TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const get=(t)=>p.find((x)=>x.type===t)?.value||"";
    return {year:Number(get("year")),month:Number(get("month")),day:Number(get("day"))};
  }
  function noon(y,m,d){ return new Date(y,m,d,12,0,0,0); }
  function key(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
  function addDays(date,n){ const r=new Date(date); r.setDate(r.getDate()+n); return r; }
  function easter(y){ const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1; return noon(y,month-1,day); }
  function nth(y,m,weekday,n){ const first=noon(y,m,1),offset=(weekday-first.getDay()+7)%7; return noon(y,m,1+offset+7*(n-1)); }
  function kings(y){ const d=noon(y,3,27); return d.getDay()===0?noon(y,3,26):d; }
  function eid(date){ const configured=EID[date.getFullYear()]; if(configured)return key(date)===configured; try{ const p=new Intl.DateTimeFormat("en-u-ca-islamic-umalqura",{timeZone:TIME_ZONE,month:"numeric",day:"numeric"}).formatToParts(date); return Number(p.find(x=>x.type==="month")?.value)===10&&Number(p.find(x=>x.type==="day")?.value)===1;}catch(_){return false;} }
  function special(date){ const y=date.getFullYear(),m=date.getMonth(),d=date.getDate(),k=key(date),es=easter(y); if(m===0&&d===1)return["Nieuwjaar.jpg","Nieuwjaar"]; if(m===1&&d===14)return["Valentijns.jpg","Valentijnsdag"]; if(k===key(es)||k===key(addDays(es,1)))return["Pasen.jpg","Pasen"]; if(k===key(kings(y)))return["Koningsdag.jpg","Koningsdag"]; if(k===key(nth(y,4,0,2)))return["Moederdag.jpg","Moederdag"]; if(k===key(nth(y,5,0,3)))return["Vaderdag.jpg","Vaderdag"]; if(eid(date))return["Suikerfeest.jpg","Suikerfeest"]; if(m===9&&d===31)return["Halloween.jpg","Halloween"]; if(m===11&&d===5)return["sinterklaas.jpg","Sinterklaas"]; if(m===11&&d>=24&&d<=26)return["Kerst.jpg","Kerst"]; if(m===11&&d===31)return["Oudjaar.jpg","Oudjaar"]; return null; }
  function season(date){ const m=date.getMonth(); if(m>=2&&m<=4)return[SEASON.spring,"Lente"]; if(m>=5&&m<=7)return[SEASON.summer,"Zomer"]; if(m>=8&&m<=10)return[SEASON.autumn,"Herfst"]; return[SEASON.winter,"Winter"]; }
  const p=parts(); const today=noon(p.year,p.month-1,p.day); const selected=special(today)||season(today); document.body.style.setProperty("--page-background-image",`url("${selected[0]}")`); document.body.style.setProperty("--background-overlay",String(ALPHA[selected[0]]??.75)); document.body.dataset.backgroundTheme=selected[1];
})();
