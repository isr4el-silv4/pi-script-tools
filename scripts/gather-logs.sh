#!/bin/bash
# Name: gather_logs
# Description: Retrieves recent system logs from journalctl or syslog fallback
# Usage: gather_logs [entry_count]
# Timeout: 60000

entry_count="${1:-20}"
journalctl -n "$entry_count" --no-pager 2>/dev/null || tail -n "$entry_count" /var/log/syslog
