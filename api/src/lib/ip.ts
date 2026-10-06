import type { FastifyRequest } from 'fastify'

export function getTrustedCidrs(): string[] {
  const cidrs = process.env.TRUSTED_PROXY_CIDRS ?? '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1/32'
  return cidrs.split(',').map(s => s.trim()).filter(Boolean)
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
}

/**
 * Check if an IP address is within a CIDR range.
 * Correctly handles all CIDR prefixes from /0 to /32.
 */
export function isInCidr(ip: string, cidr: string): boolean {
  try {
    const [range, bitsStr] = cidr.split('/')
    if (!range || !bitsStr) return false

    const bits = parseInt(bitsStr, 10)
    if (bits < 0 || bits > 32) return false

    // Calculate CIDR mask: for /n, mask has n leading 1s followed by (32-n) zeros
    // For /32: mask = 0xffffffff (exact match)
    // For /0: mask = 0 (matches everything)
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0

    const ipInt = ipToInt(ip)
    const rangeInt = ipToInt(range)

    return (ipInt & mask) === (rangeInt & mask)
  } catch {
    return false
  }
}

export function isTrustedProxy(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1') return true
  return getTrustedCidrs().some(cidr => isInCidr(ip, cidr))
}

export function extractClientIp(request: FastifyRequest): string {
  const remoteIp = request.socket.remoteAddress ?? '0.0.0.0'

  if (!isTrustedProxy(remoteIp)) {
    // Untrusted proxy: ignore X-Forwarded-For to prevent spoofing
    return remoteIp
  }

  const forwardedFor = request.headers['x-forwarded-for'] as string | undefined
  if (forwardedFor) {
    const parts = forwardedFor.split(',').map(s => s.trim()).filter(Boolean)
    // Walk from right (closest to server) to left (original client):
    // the first untrusted from the right is the real client.
    for (let i = parts.length - 1; i >= 0; i--) {
      const candidate = parts[i]!
      if (!isTrustedProxy(candidate)) {
        return candidate || remoteIp
      }
    }
    // All parts trusted: return leftmost (original client) or remote
    return parts[0] || remoteIp
  }

  return remoteIp
}