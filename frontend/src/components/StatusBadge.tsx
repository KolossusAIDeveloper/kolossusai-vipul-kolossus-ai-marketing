import React from 'react'

const STATUS_COLORS: Record<string, string> = {
  "New": "#9e9e9e",
  "Attempted - No Answer": "#ff9800",
  "Contacted": "#2196f3",
  "Interested": "#4caf50",
  "Follow-up Scheduled": "#9c27b0",
  "Demo Scheduled": "#00bcd4",
  "Proposal Sent": "#3f51b5",
  "Negotiation": "#e91e63",
  "Converted": "#1b5e20",
  "Not Interested": "#f44336",
  "Invalid / Wrong Number": "#bdbdbd",
  "Do Not Contact": "#212121",
}

export default function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#9e9e9e'
  return (
    <span
      style={{ backgroundColor: color, color: '#fff', padding: '2px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-block' }}
    >
      {status}
    </span>
  )
}

export { STATUS_COLORS }
