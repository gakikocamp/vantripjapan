#!/usr/bin/env python3
"""
VanTripJapan — Cloudflare Analytics Report
Fetches traffic data from Cloudflare GraphQL API and generates a markdown report.

Usage:
  export CF_API_TOKEN="your-cloudflare-api-token"
  python3 analytics_report.py

Required API Token permissions:
  - Zone > Analytics > Read
"""

import json, os, sys
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError

CF_API = "https://api.cloudflare.com/client/v4"
GQL_API = "https://api.cloudflare.com/client/v4/graphql"
DOMAIN = "vantripjapan.jp"

def api_get(path, token):
    req = Request(f"{CF_API}{path}", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    with urlopen(req) as res:
        return json.loads(res.read())

def gql_query(query, variables, token):
    body = json.dumps({"query": query, "variables": variables}).encode()
    req = Request(GQL_API, data=body, method="POST", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    with urlopen(req) as res:
        return json.loads(res.read())

def get_zone_id(token):
    data = api_get(f"/zones?name={DOMAIN}&status=active", token)
    zones = data.get("result", [])
    if not zones:
        # Try listing all zones
        data = api_get("/zones?per_page=50", token)
        zones = data.get("result", [])
        for z in zones:
            if DOMAIN in z.get("name", ""):
                return z["id"]
        print(f"❌ Zone not found for {DOMAIN}")
        print(f"   Available zones: {[z['name'] for z in zones]}")
        sys.exit(1)
    return zones[0]["id"]

def fetch_http_analytics(zone_id, token, days=30):
    """Fetch HTTP request analytics (server-side) — 1dGroups supports wide range"""
    since_date = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    until_date = datetime.utcnow().strftime("%Y-%m-%d")

    query = f"""{{
      viewer {{
        zones(filter: {{zoneTag: "{zone_id}"}}) {{
          httpRequests1dGroups(
            limit: 1000
            filter: {{date_geq: "{since_date}", date_leq: "{until_date}"}}
            orderBy: [date_ASC]
          ) {{
            dimensions {{ date }}
            sum {{ requests pageViews bytes threats cachedRequests }}
            uniq {{ uniques }}
          }}
        }}
      }}
    }}"""

    return gql_query(query, {}, token)

def fetch_adaptive_data(zone_id, token):
    """Fetch country, path, referrer, device — limited to 1 day on free plan"""
    since = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%dT00:00:00Z")
    until = datetime.utcnow().strftime("%Y-%m-%dT23:59:59Z")

    query = f"""{{
      viewer {{
        zones(filter: {{zoneTag: "{zone_id}"}}) {{
          countries: httpRequestsAdaptiveGroups(
            limit: 20
            filter: {{ datetime_geq: "{since}", datetime_leq: "{until}", requestSource: "eyeball" }}
            orderBy: [count_DESC]
          ) {{ dimensions {{ clientCountryName }} count }}
          paths: httpRequestsAdaptiveGroups(
            limit: 30
            filter: {{ datetime_geq: "{since}", datetime_leq: "{until}", requestSource: "eyeball", clientRequestHTTPMethodName: "GET" }}
            orderBy: [count_DESC]
          ) {{ dimensions {{ clientRequestPath }} count }}
          referrers: httpRequestsAdaptiveGroups(
            limit: 20
            filter: {{ datetime_geq: "{since}", datetime_leq: "{until}", requestSource: "eyeball" }}
            orderBy: [count_DESC]
          ) {{ dimensions {{ clientRefererHost }} count }}
          devices: httpRequestsAdaptiveGroups(
            limit: 10
            filter: {{ datetime_geq: "{since}", datetime_leq: "{until}", requestSource: "eyeball" }}
            orderBy: [count_DESC]
          ) {{ dimensions {{ clientDeviceType }} count }}
        }}
      }}
    }}"""

    return gql_query(query, {}, token)

def format_number(n):
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)

def format_bytes(b):
    if b >= 1_000_000_000:
        return f"{b/1_000_000_000:.1f} GB"
    if b >= 1_000_000:
        return f"{b/1_000_000:.1f} MB"
    return f"{b/1_000:.1f} KB"

def generate_report(http_data, adaptive_data, days):
    lines = []
    lines.append(f"# VanTripJapan アクセス解析レポート")
    lines.append(f"")
    lines.append(f"**期間**: 過去 {days} 日間（{(datetime.utcnow() - timedelta(days=days)).strftime('%Y-%m-%d')} 〜 {datetime.utcnow().strftime('%Y-%m-%d')}）")
    lines.append(f"**ドメイン**: {DOMAIN}")
    lines.append(f"**生成日時**: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC")
    lines.append("")

    # === Summary ===
    zones = (http_data or {}).get("data", {}) or {}
    zones = zones.get("viewer", {}) or {}
    zones = zones.get("zones", [{}])
    if not zones:
        lines.append("> [!WARNING]\n> データが取得できませんでした。APIトークンの権限を確認してください。")
        return "\n".join(lines)

    daily = zones[0].get("httpRequests1dGroups", [])

    total_requests = sum(d["sum"]["requests"] for d in daily)
    total_pageviews = sum(d["sum"]["pageViews"] for d in daily)
    total_uniques = sum(d["uniq"]["uniques"] for d in daily)
    total_bytes = sum(d["sum"]["bytes"] for d in daily)
    total_cached = sum(d["sum"]["cachedRequests"] for d in daily)
    cache_rate = (total_cached / total_requests * 100) if total_requests > 0 else 0
    avg_daily_pv = total_pageviews / days if days > 0 else 0

    lines.append("## サマリー")
    lines.append("")
    lines.append(f"| 指標 | 値 |")
    lines.append(f"|------|------|")
    lines.append(f"| 総リクエスト数 | {format_number(total_requests)} |")
    lines.append(f"| 総ページビュー | {format_number(total_pageviews)} |")
    lines.append(f"| ユニーク訪問者 | {format_number(total_uniques)} |")
    lines.append(f"| 1日平均PV | {avg_daily_pv:.1f} |")
    lines.append(f"| 転送データ量 | {format_bytes(total_bytes)} |")
    lines.append(f"| キャッシュ率 | {cache_rate:.1f}% |")
    lines.append("")

    # === Daily Trend ===
    if daily:
        lines.append("## 日別トレンド（直近14日）")
        lines.append("")
        lines.append("| 日付 | PV | ユニーク | リクエスト |")
        lines.append("|------|------|---------|----------|")
        for d in daily[-14:]:
            date = d["dimensions"]["date"]
            pv = d["sum"]["pageViews"]
            uniq = d["uniq"]["uniques"]
            reqs = d["sum"]["requests"]
            lines.append(f"| {date} | {pv} | {uniq} | {format_number(reqs)} |")
        lines.append("")

    # === Adaptive data (last 24h) ===
    adapt_zones = ((adaptive_data or {}).get("data", {}) or {}).get("viewer", {}) or {}
    adapt_zones = adapt_zones.get("zones", [{}])
    az = adapt_zones[0] if adapt_zones else {}

    # === Top Pages ===
    path_groups = az.get("paths", [])
    if path_groups:
        page_paths = [p for p in path_groups
                     if not any(p["dimensions"]["clientRequestPath"].endswith(ext)
                               for ext in ['.css', '.js', '.png', '.jpg', '.ico', '.svg', '.woff2', '.webp', '.json', '.xml', '.txt'])]
        if page_paths:
            lines.append("## 人気ページ TOP 15（直近24時間）")
            lines.append("")
            lines.append("| # | ページ | アクセス数 |")
            lines.append("|---|--------|----------|")
            for i, p in enumerate(page_paths[:15], 1):
                path = p["dimensions"]["clientRequestPath"] or "(direct)"
                count = p["count"]
                lines.append(f"| {i} | `{path}` | {format_number(count)} |")
            lines.append("")

    # === Countries ===
    country_groups = az.get("countries", [])
    if country_groups:
        lines.append("## アクセス元の国 TOP 10（直近24時間）")
        lines.append("")
        lines.append("| # | 国 | アクセス数 |")
        lines.append("|---|------|----------|")
        for i, c in enumerate(country_groups[:10], 1):
            country = c["dimensions"]["clientCountryName"] or "不明"
            count = c["count"]
            lines.append(f"| {i} | {country} | {format_number(count)} |")
        lines.append("")

    # === Referrers ===
    ref_groups = [r for r in az.get("referrers", []) if r["dimensions"]["clientRefererHost"]]
    if ref_groups:
        lines.append("## リファラー（流入元）TOP 10（直近24時間）")
        lines.append("")
        lines.append("| # | リファラー | アクセス数 |")
        lines.append("|---|----------|----------|")
        for i, r in enumerate(ref_groups[:10], 1):
            host = r["dimensions"]["clientRefererHost"]
            count = r["count"]
            lines.append(f"| {i} | `{host}` | {format_number(count)} |")
        lines.append("")

    # === Devices ===
    dev_groups = az.get("devices", [])
    if dev_groups:
        lines.append("## デバイス別（直近24時間）")
        lines.append("")
        lines.append("| デバイス | アクセス数 |")
        lines.append("|---------|----------|")
        for d in dev_groups:
            device = d["dimensions"]["clientDeviceType"] or "不明"
            count = d["count"]
            lines.append(f"| {device} | {format_number(count)} |")
        lines.append("")

    # === Analysis ===
    lines.append("## 分析・改善提案")
    lines.append("")

    if avg_daily_pv < 10:
        lines.append("> [!CAUTION]")
        lines.append("> 1日平均PVが非常に低い状態です。SEO・SNS・広告のいずれかで流入経路を作る必要があります。")
        lines.append("")
    elif avg_daily_pv < 50:
        lines.append("> [!WARNING]")
        lines.append("> PVは成長初期の水準です。コンテンツ数を増やしてロングテールSEOを狙いましょう。")
        lines.append("")

    lines.append("---")
    lines.append(f"*Generated by VanTripJapan Analytics Script*")

    return "\n".join(lines)


def main():
    token = os.environ.get("CF_API_TOKEN")
    if not token:
        print("❌ CF_API_TOKEN 環境変数を設定してください")
        print("   export CF_API_TOKEN='your-token-here'")
        print("")
        print("トークン作成: https://dash.cloudflare.com/profile/api-tokens")
        print("必要な権限: Zone > Analytics > Read")
        sys.exit(1)

    days = int(os.environ.get("REPORT_DAYS", "30"))

    print(f"🔍 Zone ID を取得中 ({DOMAIN})...")
    zone_id = get_zone_id(token)
    print(f"   Zone: {zone_id}")

    print(f"📊 過去{days}日のデータを取得中...")

    try:
        http_data = fetch_http_analytics(zone_id, token, days)
    except HTTPError as e:
        print(f"❌ HTTP Analytics Error: {e.code} {e.reason}")
        body = e.read().decode()
        print(body[:500])
        sys.exit(1)

    try:
        adaptive_data = fetch_adaptive_data(zone_id, token)
    except Exception as e:
        print(f"⚠️ Adaptive data error: {e}")
        adaptive_data = {}

    report = generate_report(http_data, adaptive_data, days)

    # Save report
    report_path = os.path.join(os.path.dirname(__file__), "analytics_report.md")
    with open(report_path, "w") as f:
        f.write(report)

    print(f"✅ レポート生成完了: {report_path}")
    print("")
    print(report)


if __name__ == "__main__":
    main()
