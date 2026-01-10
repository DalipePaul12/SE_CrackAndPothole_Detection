from datetime import datetime, timedelta

def get_current_ph_time():
    """Returns current time in PH (UTC+8)."""
    return datetime.utcnow() + timedelta(hours=8)

def format_datetime_str(dt: datetime):
    """Formats date to: 'January 01, 2024 at 10:30 AM'."""
    if not dt:
        return ""
    # Convert UTC to PH Time for display
    ph_time = dt + timedelta(hours=8) 
    return ph_time.strftime("%B %d, %Y at %I:%M %p")

def time_ago(dt: datetime):
    """Returns relative time (e.g., 'Just now', '5 mins ago')."""
    if not dt:
        return ""
        
    now = datetime.utcnow() # Compare sa server time
    diff = now - dt

    seconds = diff.total_seconds()
    minutes = int(seconds // 60)
    hours = int(minutes // 60)
    days = int(hours // 24)

    if seconds < 60:
        return "Just now"
    elif minutes < 60:
        return f"{minutes} min{'s' if minutes > 1 else ''} ago"
    elif hours < 24:
        return f"{hours} hour{'s' if hours > 1 else ''} ago"
    elif days < 7:
        return f"{days} day{'s' if days > 1 else ''} ago"
    else:
        return format_datetime_str(dt)

