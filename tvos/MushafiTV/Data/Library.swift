import UIKit

struct Chapter: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let verses: Int
    let page: Int
    let place: String
    var placeName: String { place == "makkah" ? "مكية" : "مدنية" }
}

struct PageInfo: Codable { let s: Int; let a: Int; let juz: Int }

struct Reciter: Identifiable, Hashable {
    let id: String
    let name: String
    let style: String
}

struct SurahAudio {
    let url: URL
    /// [ayah, startMs, endMs]
    let timings: [[Int]]
}

struct Radio: Identifiable, Hashable {
    let id: String
    let title: String
    let place: String
    let url: URL
    let backup: URL?
}

/// Everything the TV app reads, built from the same data files as the phone app.
final class Library {
    static let shared = Library()

    let chapters: [Chapter]
    let pages: [PageInfo]
    private let ayahPage: [Int: [Int]]
    let reciters: [Reciter]
    private let audio: [String: [String: Any]]
    private let daily: (order: [String], text: [String: String], surah: [String: String])
    private lazy var verses: [String: [String]] = Self.load("tv-verses") ?? [:]
    private let images = NSCache<NSNumber, UIImage>()

    let radios: [Radio] = [
        Radio(id: "sa", title: "إذاعة القرآن الكريم", place: "من المملكة العربية السعودية", url: URL(string: "https://stream.radiojar.com/0tpy1h0kxtzuv")!, backup: nil),
        Radio(id: "eg", title: "إذاعة القرآن الكريم", place: "من القاهرة", url: URL(string: "https://stream.radiojar.com/8s5u5tpdtwzuv")!, backup: nil),
        Radio(id: "tarateel", title: "تراتيل قصيرة متميزة", place: "تلاوات متنوعة على مدار الساعة", url: URL(string: "https://qurango.net/radio/tarateel")!, backup: URL(string: "https://backup.qurango.net/radio/tarateel")),
        Radio(id: "afasy", title: "مشاري العفاسي", place: "تلاوات متواصلة", url: URL(string: "https://qurango.net/radio/mishary_alafasi")!, backup: URL(string: "https://backup.qurango.net/radio/mishary_alafasi")),
        Radio(id: "basit", title: "عبد الباسط عبد الصمد", place: "تلاوة مرتلة", url: URL(string: "https://qurango.net/radio/abdulbasit_abdulsamad")!, backup: URL(string: "https://backup.qurango.net/radio/abdulbasit_abdulsamad")),
        Radio(id: "basitm", title: "عبد الباسط عبد الصمد", place: "تلاوة مجودة", url: URL(string: "https://qurango.net/radio/abdulbasit_abdulsamad_mojawwad")!, backup: URL(string: "https://backup.qurango.net/radio/abdulbasit_abdulsamad_mojawwad")),
        Radio(id: "minshawi", title: "محمد صديق المنشاوي", place: "تلاوة مجودة", url: URL(string: "https://qurango.net/radio/mohammed_siddiq_alminshawi_mojawwad")!, backup: URL(string: "https://backup.qurango.net/radio/mohammed_siddiq_alminshawi_mojawwad")),
        Radio(id: "banna", title: "محمود علي البنا", place: "تلاوات متواصلة", url: URL(string: "https://qurango.net/radio/mahmoud_ali__albanna")!, backup: URL(string: "https://backup.qurango.net/radio/mahmoud_ali__albanna")),
        Radio(id: "basfer", title: "عبد الله بصفر", place: "تلاوات متواصلة", url: URL(string: "https://qurango.net/radio/abdullah_basfer")!, backup: URL(string: "https://backup.qurango.net/radio/abdullah_basfer")),
        Radio(id: "thubaity", title: "عبد الباري الثبيتي", place: "تلاوات متواصلة", url: URL(string: "https://qurango.net/radio/abdelbari_altoubayti")!, backup: URL(string: "https://backup.qurango.net/radio/abdelbari_altoubayti")),
    ]

    private struct File: Codable { let chapters: [Chapter]; let pages: [PageInfo]; let ayahPage: [String: [Int]] }

    private init() {
        let file: File? = Self.decode("tv-library")
        chapters = file?.chapters ?? []
        pages = file?.pages ?? []
        var map: [Int: [Int]] = [:]
        for (k, v) in file?.ayahPage ?? [:] { if let n = Int(k) { map[n] = v } }
        ayahPage = map

        let raw: [String: [String: Any]] = Self.load("surah-audio") ?? [:]
        audio = raw
        let order = ["7", "2", "3", "133", "6", "1001", "1002", "1003", "1004", "1005"]
        let ids = order.filter { raw[$0] != nil } + raw.keys.filter { !order.contains($0) }.sorted()
        reciters = ids.map { id in
            Reciter(id: id, name: raw[id]?["name"] as? String ?? "قارئ",
                    style: (raw[id]?["style"] as? String ?? "").replacingOccurrences(of: " · MP3Quran", with: ""))
        }

        let d: [String: Any] = Self.load("widget-daily-verses") ?? [:]
        daily = (d["order"] as? [String] ?? [], d["ar"] as? [String: String] ?? [:], d["surah"] as? [String: String] ?? [:])
    }

    // MARK: Lookups

    func chapter(_ id: Int) -> Chapter? { (1...chapters.count).contains(id) ? chapters[id - 1] : nil }
    func info(page: Int) -> PageInfo? { (1...pages.count).contains(page) ? pages[page - 1] : nil }
    func page(surah: Int, ayah: Int) -> Int {
        guard let list = ayahPage[surah], !list.isEmpty else { return chapter(surah)?.page ?? 1 }
        return list[max(0, min(list.count - 1, ayah - 1))]
    }
    func verse(_ surah: Int, _ ayah: Int) -> String {
        guard let list = verses[String(surah)], (1...list.count).contains(ayah) else { return "" }
        return list[ayah - 1]
    }
    func reciter(_ id: String) -> Reciter? { reciters.first { $0.id == id } }

    func audio(reciter: String, surah: Int) -> SurahAudio? {
        guard let chapters = audio[reciter]?["chapters"] as? [String: Any],
              let entry = chapters[String(surah)] as? [String: Any],
              let link = entry["url"] as? String, let url = URL(string: link) else { return nil }
        let timings = (entry["timings"] as? [[Any]] ?? []).compactMap { row -> [Int]? in
            let numbers = row.compactMap { ($0 as? NSNumber)?.intValue }
            return numbers.count >= 3 ? numbers : nil
        }
        return SurahAudio(url: url, timings: timings)
    }

    /// The same verse all day, changing at midnight.
    func verseOfTheDay(_ date: Date = Date()) -> (text: String, reference: String) {
        guard !daily.order.isEmpty else { return ("فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا", "الشرح · 5") }
        let day = Calendar(identifier: .gregorian).ordinality(of: .day, in: .era, for: date) ?? 0
        let key = daily.order[day % daily.order.count]
        let ayah = Int(key.split(separator: ":").last ?? "") ?? 0
        return (daily.text[key] ?? "", "\(daily.surah[key] ?? "") · \(ayah.ar)")
    }

    /// Pre-rendered page from the app's own Mushaf (same font, frames and ornaments).
    /// Reciter portraits bundled from the phone app (android/assets/images).
    private static let portraits = ["7": "mishary-alafasy", "133": "maher-almuaiqly", "6": "mahmoud-alhusary", "2": "abdulbasit-abdulsamad",
                                    "3": "abdurrahman-as-sudais", "1001": "ali-alhudhaifi", "1002": "muhammad-ayyub", "1003": "khalid-almuhanna",
                                    "1004": "ibrahim-alakhdar", "1005": "ahmad-alnafees"]
    private var portraitCache: [String: UIImage] = [:]
    func portrait(_ id: String) -> UIImage? {
        if let cached = portraitCache[id] { return cached }
        guard let name = Self.portraits[id], let url = Bundle.main.url(forResource: name, withExtension: "png"),
              let image = UIImage(contentsOfFile: url.path) else { return nil }
        portraitCache[id] = image
        return image
    }

    func image(page: Int) -> UIImage? {
        let key = NSNumber(value: page)
        if let cached = images.object(forKey: key) { return cached }
        let name = String(format: "page-%03d", page)
        guard let url = Bundle.main.url(forResource: name, withExtension: "webp", subdirectory: "Pages")
                ?? Bundle.main.url(forResource: name, withExtension: "jpg", subdirectory: "Pages"),
              let image = UIImage(contentsOfFile: url.path) else { return nil }
        images.setObject(image, forKey: key)
        return image
    }

    /// Each verse's rectangles on its page image (fractions of the image, one per line), for the reciting highlight.
    private lazy var ayahRects: [String: [String: [[Double]]]] = {
        guard let url = Bundle.main.url(forResource: "ayahs", withExtension: "json", subdirectory: "Pages"),
              let data = try? Data(contentsOf: url),
              let json = try? JSONDecoder().decode([String: [String: [[Double]]]].self, from: data) else { return [:] }
        return json
    }()
    func rects(page: Int, surah: Int, ayah: Int) -> [CGRect] {
        (ayahRects[String(page)]?["\(surah):\(ayah)"] ?? []).compactMap { r in r.count == 4 ? CGRect(x: r[0], y: r[1], width: r[2], height: r[3]) : nil }
    }

    // MARK: Files

    private static func url(_ name: String, _ ext: String) -> URL? {
        Bundle.main.url(forResource: name, withExtension: ext) ?? Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "Data")
    }
    private static func decode<T: Decodable>(_ name: String) -> T? {
        guard let url = url(name, "json"), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
    private static func load<T>(_ name: String) -> T? {
        guard let url = url(name, "json"), let data = try? Data(contentsOf: url) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? T
    }
}
