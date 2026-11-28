import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var prayer: PrayerModel
    @EnvironmentObject private var location: LocationModel
    @EnvironmentObject private var appearance: AppearanceModel
    private let library = Library.shared
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 26), count: 5)

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 50) {
                VStack(alignment: .leading, spacing: 24) {
                    SectionTitle(title: "الموقع", detail: "لمواقيت الصلاة والطقس · الحالي: \(prayer.city)")
                    Button { location.useAutomatic() } label: {
                        HStack(spacing: 22) {
                            Image(systemName: "location.fill").font(.system(size: 34, weight: .semibold))
                            VStack(alignment: .leading, spacing: 6) {
                                Text(location.automatic ? "موقعي الحالي: \(prayer.city)" : "تحديد موقعي تلقائيًا")
                                    .font(.system(size: 30, weight: .heavy))
                                SubText(location.busy ? "جارٍ تحديد الموقع…" : (location.automatic ? location.sourceLabel : "من جهاز Apple TV، أو تقريبيًا من اتصال الإنترنت"), size: 21)
                            }
                            Spacer()
                            if location.automatic { Image(systemName: "checkmark.circle.fill").font(.system(size: 32)) }
                        }
                        .padding(.horizontal, 30).frame(height: 120)
                    }
                    .buttonStyle(TileButtonStyle(radius: 26))
                    SubText("أو اختر مدينتك يدويًا", size: 22).padding(.top, 8)
                    LazyVGrid(columns: columns, spacing: 26) {
                        ForEach(Cities.all) { city in
                            Button { location.choose(city) } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(city.name).font(.system(size: 27, weight: .bold))
                                        SubText(city.country, size: 18)
                                    }
                                    Spacer()
                                    if !location.automatic && prayer.city == city.name { Image(systemName: "checkmark.circle.fill").font(.system(size: 28)) }
                                }
                                .padding(.horizontal, 24).frame(height: 100)
                            }
                            .buttonStyle(TileButtonStyle(radius: 22))
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 24) {
                    SectionTitle(title: "المظهر", detail: "الآن: \(appearance.phase.title) · " + (appearance.light ? "فاتح" : "داكن"))
                    HStack(spacing: 26) {
                        ForEach(AppearanceModel.Mode.allCases, id: \.self) { mode in
                            Button { appearance.mode = mode } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(mode.title).font(.system(size: 27, weight: .bold))
                                        SubText(mode.detail, size: 19)
                                    }
                                    Spacer()
                                    if appearance.mode == mode { Image(systemName: "checkmark.circle.fill").font(.system(size: 28)) }
                                }
                                .padding(.horizontal, 26).frame(height: 110)
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
                        Text("بيانات الطقس من المعهد النرويجي للأرصاد MET Norway · CC BY 4.0").font(.system(size: 20)).foregroundStyle(Theme.muted)
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
