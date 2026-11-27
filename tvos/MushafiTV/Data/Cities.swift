import Foundation

struct City: Identifiable, Hashable {
    let name: String
    let country: String
    let latitude: Double
    let longitude: Double
    let zone: String
    var id: String { name }
}

/// Apple TV has no GPS, so the viewer picks the city once.
enum Cities {
    static let all: [City] = [
        City(name: "الرياض", country: "السعودية", latitude: 24.7136, longitude: 46.6753, zone: "Asia/Riyadh"),
        City(name: "مكة المكرمة", country: "السعودية", latitude: 21.4225, longitude: 39.8262, zone: "Asia/Riyadh"),
        City(name: "المدينة المنورة", country: "السعودية", latitude: 24.4686, longitude: 39.6142, zone: "Asia/Riyadh"),
        City(name: "جدة", country: "السعودية", latitude: 21.4858, longitude: 39.1925, zone: "Asia/Riyadh"),
        City(name: "الدمام", country: "السعودية", latitude: 26.4207, longitude: 50.0888, zone: "Asia/Riyadh"),
        City(name: "الخبر", country: "السعودية", latitude: 26.2172, longitude: 50.1971, zone: "Asia/Riyadh"),
        City(name: "الأحساء", country: "السعودية", latitude: 25.3647, longitude: 49.5856, zone: "Asia/Riyadh"),
        City(name: "الطائف", country: "السعودية", latitude: 21.2703, longitude: 40.4158, zone: "Asia/Riyadh"),
        City(name: "بريدة", country: "السعودية", latitude: 26.3260, longitude: 43.9750, zone: "Asia/Riyadh"),
        City(name: "تبوك", country: "السعودية", latitude: 28.3838, longitude: 36.5550, zone: "Asia/Riyadh"),
        City(name: "أبها", country: "السعودية", latitude: 18.2164, longitude: 42.5053, zone: "Asia/Riyadh"),
        City(name: "خميس مشيط", country: "السعودية", latitude: 18.3000, longitude: 42.7333, zone: "Asia/Riyadh"),
        City(name: "حائل", country: "السعودية", latitude: 27.5114, longitude: 41.7208, zone: "Asia/Riyadh"),
        City(name: "جازان", country: "السعودية", latitude: 16.8892, longitude: 42.5511, zone: "Asia/Riyadh"),
        City(name: "نجران", country: "السعودية", latitude: 17.4924, longitude: 44.1277, zone: "Asia/Riyadh"),
        City(name: "ينبع", country: "السعودية", latitude: 24.0895, longitude: 38.0618, zone: "Asia/Riyadh"),
        City(name: "الجبيل", country: "السعودية", latitude: 27.0174, longitude: 49.6225, zone: "Asia/Riyadh"),
        City(name: "الباحة", country: "السعودية", latitude: 20.0129, longitude: 41.4677, zone: "Asia/Riyadh"),
        City(name: "عرعر", country: "السعودية", latitude: 30.9753, longitude: 41.0381, zone: "Asia/Riyadh"),
        City(name: "سكاكا", country: "السعودية", latitude: 29.9697, longitude: 40.2064, zone: "Asia/Riyadh"),
        City(name: "الكويت", country: "الكويت", latitude: 29.3759, longitude: 47.9774, zone: "Asia/Kuwait"),
        City(name: "الدوحة", country: "قطر", latitude: 25.2854, longitude: 51.5310, zone: "Asia/Qatar"),
        City(name: "المنامة", country: "البحرين", latitude: 26.2285, longitude: 50.5860, zone: "Asia/Bahrain"),
        City(name: "أبوظبي", country: "الإمارات", latitude: 24.4539, longitude: 54.3773, zone: "Asia/Dubai"),
        City(name: "دبي", country: "الإمارات", latitude: 25.2048, longitude: 55.2708, zone: "Asia/Dubai"),
        City(name: "مسقط", country: "عُمان", latitude: 23.5880, longitude: 58.3829, zone: "Asia/Muscat"),
        City(name: "عمّان", country: "الأردن", latitude: 31.9454, longitude: 35.9284, zone: "Asia/Amman"),
        City(name: "القاهرة", country: "مصر", latitude: 30.0444, longitude: 31.2357, zone: "Africa/Cairo"),
        City(name: "إسطنبول", country: "تركيا", latitude: 41.0082, longitude: 28.9784, zone: "Europe/Istanbul"),
        City(name: "لندن", country: "المملكة المتحدة", latitude: 51.5074, longitude: -0.1278, zone: "Europe/London"),
    ]
}
