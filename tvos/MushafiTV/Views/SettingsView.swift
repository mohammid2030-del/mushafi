import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var prayer: PrayerModel
    private let library = Library.shared
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 26), count: 5)

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 50) {
                VStack(alignment: .leading, spacing: 24) {
                    SectionTitle(title: "مدينتك", detail: "لحساب مواقيت الصلاة · الحالية: \(prayer.city)")
                    LazyVGrid(columns: columns, spacing: 26) {
                        ForEach(Cities.all) { city in
                            Button { prayer.choose(city) } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(city.name).font(.system(size: 27, weight: .bold))
                                        SubText(city.country, size: 18)
                                    }
                                    Spacer()
                                    if prayer.city == city.name { Image(systemName: "checkmark.circle.fill").font(.system(size: 28)) }
                                }
                                .padding(.horizontal, 24).frame(height: 100)
                            }
                            .buttonStyle(TileButtonStyle(radius: 22))
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 24) {
                    SectionTitle(title: "القارئ المفضّل", detail: "يُستخدم عند الاستماع من المصحف")
                    LazyVGrid(columns: columns, spacing: 26) {
                        ForEach(library.reciters) { reciter in
                            Button { state.reciterId = reciter.id } label: {
                                HStack {
                                    Text(reciter.name).font(.system(size: 25, weight: .bold)).lineLimit(1).minimumScaleFactor(0.8)
                                    Spacer()
                                    if state.reciterId == reciter.id { Image(systemName: "star.fill").font(.system(size: 24)) }
                                }
                                .padding(.horizontal, 24).frame(height: 96)
                            }
                            .buttonStyle(TileButtonStyle(radius: 22))
                        }
                    }
                }
                HStack(spacing: 24) {
                    Image("Logo").resizable().frame(width: 90, height: 90).clipShape(RoundedRectangle(cornerRadius: 22))
                    VStack(alignment: .leading, spacing: 6) {
                        Text("مصحفي · Apple TV").font(.system(size: 30, weight: .heavy))
                        Text("مجاني بالكامل وبدون إعلانات · mushafiapp.com").font(.system(size: 22)).foregroundStyle(Theme.muted)
                        Text("الإصدار \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")")
                            .font(.system(size: 20)).foregroundStyle(Theme.muted)
                    }
                }
            }
            .padding(.horizontal, 90)
            .padding(.vertical, 30)
        }
    }
}
