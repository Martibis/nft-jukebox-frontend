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

// Validate an outbound fetch target; returns { url } or { error }.
export function validateTarget(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return { error: "Invalid url" };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { error: "Only http/https protocols are allowed" };
  }

  if (FORBIDDEN_HOSTS.has(url.hostname) || isPrivateHostname(url.hostname)) {
    return { error: "Target host is not allowed" };
  }

  return { url };
}
