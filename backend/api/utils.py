import socket
from urllib.parse import urlparse
import ipaddress
import structlog

log = structlog.get_logger()

BLOCKED_RANGES = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

async def assert_safe_url(url_str: str) -> None:
    parsed = urlparse(url_str)
    if parsed.scheme != "https":
        raise ValueError("Only HTTPS URLs are allowed")
    
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Invalid URL: no hostname")
        
    try:
        # Resolve hostname to IP
        # Note: socket.getaddrinfo is blocking, but normally fast enough. 
        # In a real async app we might use a threadpool or aio-dns.
        addr_info = socket.getaddrinfo(hostname, None)
        for _, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            ip = ipaddress.ip_address(ip_str)
            for range in BLOCKED_RANGES:
                if ip in range:
                    log.warning("ssrf.blocked_attempt", url=url_str, ip=ip_str)
                    raise ValueError(f"URL resolves to private network range: {ip_str}")
    except socket.gaierror:
        raise ValueError(f"Could not resolve hostname: {hostname}")
