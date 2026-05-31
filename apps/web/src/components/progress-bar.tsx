interface ProgressBarProps {
  meeting: number;
  notMeeting: number;
  total: number;
}

export function ProgressBar({ meeting, notMeeting, total }: ProgressBarProps) {
  if (total === 0) return null;

  const meetingPct = (meeting / total) * 100;
  const notMeetingPct = (notMeeting / total) * 100;

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1 w-24 overflow-hidden rounded-full bg-muted">
        {meetingPct > 0 && <div className="bg-meeting" style={{ width: `${meetingPct}%` }} />}
        {notMeetingPct > 0 && (
          <div className="bg-attention" style={{ width: `${notMeetingPct}%` }} />
        )}
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {meeting}/{total}
      </span>
    </div>
  );
}
