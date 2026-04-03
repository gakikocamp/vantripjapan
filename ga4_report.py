#!/usr/bin/env python3
"""Quick GA4 Multi-Site Report"""
import json, time, base64, os, sys
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

CREDS = os.path.join(os.path.dirname(__file__), ".credentials", "ga4-service-account.json")
SITES = {
    "VanTripJapan": "properties/525730571",
    "JDLTC": "properties/527328104",
    "CRYSTALINSENCE": "properties/475744421",
    "キャンジョコーポレート": "properties/349970496",
}

def auth():
    with open(CREDS) as f:
        c = json.load(f)
    h = base64.urlsafe_b64encode(json.dumps({"alg":"RS256","typ":"JWT"}).encode()).rstrip(b"=")
    n = int(time.time())
    p = base64.urlsafe_b64encode(json.dumps({
        "iss":c["client_email"],"scope":"https://www.googleapis.com/auth/analytics.readonly",
        "aud":"https://oauth2.googleapis.com/token","iat":n,"exp":n+3600
    }).encode()).rstrip(b"=")
    pk = serialization.load_pem_private_key(c["private_key"].encode(), password=None)
    s = pk.sign(h+b"."+p, padding.PKCS1v15(), hashes.SHA256())
    jwt = h+b"."+p+b"."+base64.urlsafe_b64encode(s).rstrip(b"=")
    r = Request("https://oauth2.googleapis.com/token", method="POST",
        data=f"grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={jwt.decode()}".encode(),
        headers={"Content-Type":"application/x-www-form-urlencoded"})
    with urlopen(r) as res:
        return json.loads(res.read())["access_token"]

def report(pid, token, dims, mets, pf=None):
    body = {"dateRanges":[{"startDate":"30daysAgo","endDate":"today"}],
            "dimensions":[{"name":d} for d in dims],
            "metrics":[{"name":m} for m in mets],"limit":20}
    if pf:
        body["dimensionFilter"]={"filter":{"fieldName":"pagePath","stringFilter":{"matchType":"BEGINS_WITH","value":pf}}}
    r = Request(f"https://analyticsdata.googleapis.com/v1beta/{pid}:runReport",
        data=json.dumps(body).encode(),method="POST",
        headers={"Authorization":f"Bearer {token}","Content-Type":"application/json"})
    with urlopen(r) as res:
        return json.loads(res.read())

def fmt(n):
    n=int(float(n))
    return f"{n/1000:.1f}K" if n>=1000 else str(n)

def main():
    print("🔑 認証中...")
    token = auth()
    print("✅ 認証成功!\n")
    
    lines = ["# Camp Joshi ポートフォリオ GA4レポート","",
        f"**期間**: 過去30日間",
        f"**生成日時**: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC","","---"]

    for name, pid in SITES.items():
        print(f"📈 {name}...")
        lines.append(f"\n## {name}\n")
        try:
            r = report(pid, token, [], ["sessions","totalUsers","screenPageViews","averageSessionDuration","bounceRate"])
            if r.get("rows"):
                v = r["rows"][0]["metricValues"]
                lines.extend([
                    "| 指標 | 値 |","|------|------|",
                    f"| セッション | {fmt(v[0]['value'])} |",
                    f"| ユーザー | {fmt(v[1]['value'])} |",
                    f"| PV | {fmt(v[2]['value'])} |",
                    f"| 平均滞在 | {float(v[3]['value']):.0f}秒 |",
                    f"| 直帰率 | {float(v[4]['value'])*100:.1f}% |",""])
            else:
                lines.append("> データなし\n")

            r2 = report(pid, token, ["pagePath"], ["screenPageViews"])
            if r2.get("rows"):
                lines.extend(["**人気ページ TOP 5:**\n","| ページ | PV |","|--------|-----|"])
                for row in r2["rows"][:5]:
                    p=row["dimensionValues"][0]["value"]; pv=row["metricValues"][0]["value"]
                    lines.append(f"| `{p}` | {fmt(int(pv))} |")
                lines.append("")

            r3 = report(pid, token, ["sessionDefaultChannelGroup"], ["sessions"])
            if r3.get("rows"):
                lines.extend(["**流入チャネル:**\n","| チャネル | セッション |","|---------|----------|"])
                for row in r3["rows"][:5]:
                    ch=row["dimensionValues"][0]["value"]; s=row["metricValues"][0]["value"]
                    lines.append(f"| {ch} | {fmt(int(s))} |")
                lines.append("")

            r4 = report(pid, token, ["country"], ["sessions"])
            if r4.get("rows"):
                lines.extend(["**国別 TOP 5:**\n","| 国 | セッション |","|-----|----------|"])
                for row in r4["rows"][:5]:
                    c=row["dimensionValues"][0]["value"]; s=row["metricValues"][0]["value"]
                    lines.append(f"| {c} | {fmt(int(s))} |")
                lines.append("")
        except Exception as e:
            lines.append(f"> ⚠️ Error: {e}\n")

    # Camp consul
    print("📈 キャンプ場コンサル...")
    lines.append("\n## キャンプ場コンサル（/campconsul/）\n")
    try:
        r = report("properties/349970496", token, [], ["sessions","totalUsers","screenPageViews"], "/campconsul/")
        if r.get("rows"):
            v = r["rows"][0]["metricValues"]
            lines.extend(["| 指標 | 値 |","|------|------|",
                f"| セッション | {fmt(v[0]['value'])} |",
                f"| ユーザー | {fmt(v[1]['value'])} |",
                f"| PV | {fmt(v[2]['value'])} |",""])
        else:
            lines.append("> /campconsul/ のデータなし\n")
    except Exception as e:
        lines.append(f"> ⚠️ Error: {e}\n")

    lines.extend(["---","*Generated by Camp Joshi Portfolio Analytics*"])
    out = "\n".join(lines)

    path = os.path.join(os.path.dirname(__file__), "ga4_portfolio_report.md")
    with open(path, "w") as f:
        f.write(out)
    print(f"\n✅ レポート完了: {path}\n")
    print(out)

if __name__ == "__main__":
    main()
