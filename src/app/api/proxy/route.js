import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORBIDDEN_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isPrivateHostname(hostname) {
  if (/^(10\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.test(hostname)) return true;
  if (/^(192\.168\.\d{1,3}\.\d{1,3})$/.test(hostname)) return true;
  const match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (match) {
    const second = parseInt(match[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (/^(169\.254\.\d{1,3}\.\d{1,3})$/.test(hostname)) return true;
  return false;
}

async function proxy(request, method) {
  const { searchParams } = request.nextUrl;
  const target = searchParams.get("url");
  if (!target) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 }
    );
  }

  let url;
  try {
    url = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return NextResponse.json(
      { error: "Only http/https protocols are allowed" },
      { status: 400 }
    );
  }

  if (FORBIDDEN_HOSTS.has(url.hostname) || isPrivateHostname(url.hostname)) {
    return NextResponse.json(
      { error: "Target host is not allowed" },
      { status: 400 }
    );
  }

  const outgoingHeaders = new Headers();
  const forwardHeaderNames = [
    "accept",
    "range",
    "if-none-match",
    "if-modified-since",
  ];
  for (const name of forwardHeaderNames) {
    const value = request.headers.get(name);
    if (value) outgoingHeaders.set(name, value);
  }
  // Request identity encoding to avoid downstream decode mismatches
  outgoingHeaders.set("accept-encoding", "identity");

  try {
    const upstreamResponse = await fetch(url.toString(), {
      method,
      headers: outgoingHeaders,
      redirect: "follow",
      cache: "no-store",
    });

    const headers = new Headers(upstreamResponse.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    // Remove compression-related headers because the body may already be decoded
    headers.delete("content-encoding");
    headers.delete("Content-Encoding");
    headers.delete("content-length");
    headers.delete("Content-Length");

    if (method === "HEAD") {
      return new Response(null, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers,
      });
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Upstream fetch failed" },
      { status: 502 }
    );
  }
}

export async function GET(request) {
  return proxy(request, "GET");
}

export async function HEAD(request) {
  return proxy(request, "HEAD");
}

export async function OPTIONS() {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "range,accept,if-none-match,if-modified-since,content-type"
  );
  return new Response(null, { status: 204, headers });
}
