import type { FastifyRequest } from 'fastify'
import { env } from '../config/env.js'

const TRUSTED_CIDRS = env.TRUSTED_PROXY_CIDRS.split(',').map(s => s.trim()).filter(Boolean)

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
}

function isInCidr(ip: string, cidr: string): boolean {
  try {
    const [range, bits] = cidr.split('/')
    if (!range || !bits) return false
    const mask = ~(0xffffffff >>> parseInt(bits, 10)) >>> 0
    return (ipToInt(ip) & mask) === (ipToInt(range) & mask)
  } catch {
    return false
  }
}

function isTrustedProxy(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1') return true
  return TRUSTED_CIDRS.some(cidr => isInCidr(ip, cidr))
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
