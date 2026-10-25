"""Importa cadastro público de locais, coordenadas e seções do TSE."""
import csv, io, json, re, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path
SOURCE="https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip"
SOURCE_PAGE="https://dadosabertos.tse.jus.br/dataset/eleitorado-2026/resource/300626b4-2b24-4d2e-b4fc-46b569cfffe5"
MISSING={"","#NULO#","#NE","-1","-3","N/A"}
def value(row,*keys):
    for key in keys:
        v=str(row.get(key,"") or "").strip()
        if v not in MISSING: return v
    return ""
def numeric_code(text,size):
    return text.zfill(size) if re.fullmatch(r"\d{1,"+str(size)+"}",text) else ""
def coordinate(text):
    try:
        n=float(text.replace(",","."))
        return n if -180<=n<=180 else None
    except (ValueError,AttributeError): return None
def build_rows(rows):
    cities={}
    for row in rows:
        if value(row,"ANO_ELEICAO","AA_ELEICAO","ANO_ELEITORAL")!="2026": continue
        turn=value(row,"NR_TURNO")
        if turn not in {"1","2"}: raise ValueError("Turno ausente ou inválido.")
        uf=value(row,"SG_UF").lower()
        if not re.fullmatch(r"[a-z]{2}",uf): continue
        city=numeric_code(value(row,"CD_MUNICIPIO"),5)
        zone=numeric_code(value(row,"NR_ZONA","NR_ZONA_ELEITORAL"),4)
        section=numeric_code(value(row,"NR_SECAO","NR_SECAO_ELEITORAL"),4)
        local=value(row,"NR_LOCAL_VOTACAO","CD_LOCAL_VOTACAO")
        if not city or not zone or not section or not re.fullmatch(r"\d{1,10}",local): continue
        key=(turn,uf,city)
        c=cities.setdefault(key,{"name":value(row,"NM_MUNICIPIO"),"zones":set(),"places":{},
            "generationDate":value(row,"DT_GERACAO"),"generationTime":value(row,"HH_GERACAO")})
        c["zones"].add(zone)
        place_key=zone+"/"+local.zfill(4)
        p=c["places"].setdefault(place_key,{"id":place_key,"code":local.zfill(4),
            "name":value(row,"NM_LOCAL_VOTACAO") or "Local "+local,
            "address":value(row,"DS_ENDERECO","DS_LOCAL_VOTACAO_ENDERECO","DS_ENDERECO_LOCAL_VOTACAO"),
            "district":value(row,"NM_BAIRRO"),"postalCode":value(row,"NR_CEP"),"zone":zone,
            "coordinates":None,"sections":set(),"sectionDetails":{},"status":value(row,"DS_SITU_LOCAL_VOTACAO")})
        p["sections"].add(section)
        principal=numeric_code(value(row,"NR_SECAO_PRINCIPAL"),4)
        p["sectionDetails"][section]={"number":section,"principal":principal if principal and principal!=section else None,"status":value(row,"DS_SITU_SECAO"),"aggregation":value(row,"DS_TIPO_SECAO_AGREGADA")}
        lat=coordinate(value(row,"NR_LATITUDE","NR_LATITUDE_LOCAL_VOTACAO","LATITUDE"))
        lon=coordinate(value(row,"NR_LONGITUDE","NR_LONGITUDE_LOCAL_VOTACAO","LONGITUDE"))
        valid=lat is not None and lon is not None and -90<=lat<=90
        if valid and uf!="zz": valid=-35<=lat<=6 and -75<=lon<=-28
        if valid:
            coords=[lon,lat]
            if p["coordinates"] is not None and p["coordinates"]!=coords:
                p["coordinateConflict"]=True;p["coordinates"]=None
            elif not p.get("coordinateConflict"): p["coordinates"]=coords
    return cities
def write_cities(cities,output):
    fetched=datetime.now(timezone.utc).isoformat();catalog={}
    for (turn,uf,city),c in cities.items():
        places=[{**p,"sections":sorted(p["sections"]),"sectionDetails":sorted(p["sectionDetails"].values(),key=lambda s:s["number"]),"coordinateSource":"TSE" if p["coordinates"] else None} for p in c["places"].values()]
        places.sort(key=lambda p:(p["name"],p["zone"],p["code"]))
        body={"schema":1,"official":True,"year":2026,"turn":turn,"uf":uf,"municipality":city,
            "municipalityName":c["name"],"generationDate":c["generationDate"],"generationTime":c["generationTime"],
            "source":SOURCE,"sourcePage":SOURCE_PAGE,"fetchedAt":fetched,"places":places}
        dest=output/turn/uf;dest.mkdir(parents=True,exist_ok=True)
        (dest/(city+".json")).write_text(json.dumps(body,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
        catalog.setdefault((turn,uf),[]).append({"code":city,"name":c["name"],"uf":uf,
            "zones":sorted(c["zones"]),"places":len(places),"plotted":sum(p["coordinates"] is not None for p in places)})
    for (turn,uf),municipalities in catalog.items():
        body={"official":True,"year":2026,"turn":turn,"uf":uf,"source":SOURCE,"sourcePage":SOURCE_PAGE,
            "fetchedAt":fetched,"municipalities":sorted(municipalities,key=lambda m:m["name"])}
        (output/turn/uf/"index.json").write_text(json.dumps(body,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    metadata={"official":True,"year":2026,"source":SOURCE,"sourcePage":SOURCE_PAGE,"fetchedAt":fetched,
        "cities":len(cities),"places":sum(len(c["places"]) for c in cities.values()),
        "sections":sum(len(p["sections"]) for c in cities.values() for p in c["places"].values()),
        "plotted":sum(p["coordinates"] is not None for c in cities.values() for p in c["places"].values()),"turns":sorted(set(k[0] for k in cities))}
    (output/"catalog.json").write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding="utf-8")
    return metadata
def main():
    cache=Path(".cache");cache.mkdir(exist_ok=True);archive=cache/"eleitorado_local_votacao_2026.zip"
    if not archive.exists():
        print("Baixando cadastro oficial de locais do TSE.",flush=True)
        request=urllib.request.Request(SOURCE,headers={"User-Agent":"Radar-do-Voto/1.2","Accept":"application/zip"})
        with urllib.request.urlopen(request,timeout=120) as response,archive.open("wb") as target:
            while chunk:=response.read(1024*1024): target.write(chunk)
    with zipfile.ZipFile(archive) as z:
        names=[n for n in z.namelist() if n.lower().endswith(".csv") and not n.startswith("__MACOSX")]
        if not names: raise ValueError("Arquivo do TSE sem CSV.")
        national=[n for n in names if re.search(r"_(BRASIL|BR)\.csv$",n,re.I)]
        if national: names=national
        def rows():
            for name in names:
                with z.open(name) as data: sample=data.read(65536)
                try: sample.decode("utf-8-sig");encoding="utf-8-sig"
                except UnicodeDecodeError: encoding="iso-8859-1"
                with z.open(name) as data,io.TextIOWrapper(data,encoding=encoding,newline="") as stream:
                    reader=csv.DictReader(stream,delimiter=";")
                    print("Cabeçalho oficial: "+", ".join(reader.fieldnames or []),flush=True)
                    required={"SG_UF","CD_MUNICIPIO","NR_TURNO","NM_LOCAL_VOTACAO"}
                    if not required.issubset(set(reader.fieldnames or [])): raise ValueError("Estrutura do cadastro mudou.")
                    yield from reader
        cities=build_rows(rows())
    if sum(len(c["places"]) for c in cities.values())<1000: raise ValueError("Cadastro nacional incompleto.")
    print(json.dumps(write_cities(cities,Path("data/polling-places")),ensure_ascii=False),flush=True)
if __name__=="__main__": main()
