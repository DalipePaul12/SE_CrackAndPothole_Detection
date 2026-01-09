
import math
def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    # ... (yung code mo para sa Haversine formula)
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0) ** 2
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c
def is_nearby(lat1: float, lon1: float, lat2: float, lon2: float, radius_meters: float = 20.0) -> bool:
    dist = calculate_distance(lat1, lon1, lat2, lon2)
    return dist <= radius_meters
