# Replace App Store screenshots from the store-assets branch (screenshots/<device>/<n>.png).
# MODE=inspect lists the editable version, its localizations and screenshot sets; MODE=upload replaces them.
require 'spaceship'
mode = ENV['MODE'] || 'inspect'
Spaceship::ConnectAPI.token = Spaceship::ConnectAPI::Token.create(key_id: ENV['ASC_KEY_ID'], issuer_id: ENV['ASC_ISSUER_ID'], key: File.read(ENV['ASC_KEY_PATH']))
app = Spaceship::ConnectAPI::App.find('com.mohammedasif.mushafi') or abort('app not found')
ios = Spaceship::ConnectAPI::Platform::IOS
v = app.get_edit_app_store_version(platform: ios)
if v.nil? && %w[upload metadata].include?(mode) && ENV['NEW_VERSION'].to_s != ''
  app.ensure_version!(ENV['NEW_VERSION'], platform: ios)
  v = app.get_edit_app_store_version(platform: ios)
end
live = app.get_live_app_store_version(platform: ios) rescue nil
info = (app.fetch_edit_app_info || app.fetch_live_app_info) rescue nil
puts "store name/subtitle languages: #{info ? info.get_app_info_localizations.map { |l| "#{l.locale}(#{l.name})" }.join(', ') : '?'}"
puts "live version languages: #{live ? live.get_app_store_version_localizations.map(&:locale).join(', ') : '?'}"
if live && mode == 'inspect'
  live.get_app_store_version_localizations.each { |l| (l.get_app_screenshot_sets rescue []).each { |st| puts "  live #{l.locale} #{st.screenshot_display_type}: #{(st.app_screenshots||[]).size}" } }
end
puts "live: #{live&.version_string} #{live&.app_store_state}"
abort('no editable version (create one in App Store Connect or pass NEW_VERSION)') unless v
puts "editable: #{v.version_string} #{v.app_store_state}"
if mode == 'dump'
  require 'json'
  out = v.get_app_store_version_localizations.map { |l| {locale: l.locale, description: l.description, keywords: l.keywords, promotional_text: l.promotional_text, whats_new: l.whats_new, marketing_url: l.marketing_url, support_url: l.support_url} }
  puts 'JSON-BEGIN'; puts JSON.generate(out); puts 'JSON-END'; exit
end
if mode == 'metadata'
  require 'json'
  if ENV['NEW_VERSION'].to_s != '' && v.version_string != ENV['NEW_VERSION']
    v.update(attributes: {versionString: ENV['NEW_VERSION']}); puts "version #{v.version_string} -> #{ENV['NEW_VERSION']}"
  end
  meta = JSON.parse(File.read('shots/metadata.json'))
  v.get_app_store_version_localizations.each do |l|
    m = meta[l.locale] or (puts "skip #{l.locale} (no text)"; next)
    attrs = {description: m['description'], keywords: m['keywords'], promotionalText: m['promotional_text'], marketingUrl: m['marketing_url'], supportUrl: m['support_url']}
    attrs[:whatsNew] = m['whats_new']
    l.update(attributes: attrs); puts "metadata #{l.locale} ok"
  end
  puts 'DONE'; exit
end
DIMS = {[1320,2868]=>'iPhone-6.9',[2064,2752]=>'iPad-13',[1398,2034]=>'iPhone-Duo-outer',[2007,2853]=>'iPhone-Duo-inner'}
TYPES = {'APP_IPHONE_67'=>'iPhone-6.9','APP_IPAD_PRO_3GEN_129'=>'iPad-13','APP_IPHONE_DUO'=>'iPhone-Duo-inner'}
LANG_OF = ->(loc) { {'ar-SA'=>'ar','fr-FR'=>'fr','fr-CA'=>'fr','ur-PK'=>'ur','bn-BD'=>'bn','tr'=>'tr','ru'=>'ru'}[loc] || 'en' }
v.get_app_store_version_localizations.each do |loc|
  next if ENV['ONLY'].to_s != '' && ENV['ONLY'] != loc.locale
  sets = loc.get_app_screenshot_sets
  lg = LANG_OF.(loc.locale); root = lg == 'ar' ? 'shots/screenshots' : "shots/screenshots_#{lg}"
  puts "== #{loc.locale} (#{lg})"
  done = []
  sets.each do |set|
    shots = set.app_screenshots || []
    dims = shots.map { |s| a = s.image_asset || {}; [a['width'], a['height']] }.uniq
    folder = TYPES[set.screenshot_display_type] || dims.map { |d| DIMS[d] }.compact.first
    puts "  #{set.screenshot_display_type}: #{shots.size} shots #{dims.inspect} -> #{folder.inspect}"
    if mode == 'upload' && folder.nil?
      shots.each(&:delete!); puts "    cleared old #{set.screenshot_display_type}"; next
    end
    next unless mode == 'upload' && folder
    shots.each(&:delete!)
    Dir[File.join(root, folder, '*.png')].sort_by { |f| File.basename(f).to_i }.each do |f|
      set.upload_screenshot(path: f, wait_for_processing: false); puts "    uploaded #{folder}/#{File.basename(f)}"
    end
    done << folder
  end
  next unless mode == 'upload'
  TYPES.each do |type, folder|
    next if done.include?(folder)
    set = loc.create_app_screenshot_set(attributes: { screenshotDisplayType: type })
    Dir[File.join(root, folder, '*.png')].sort_by { |f| File.basename(f).to_i }.each do |f|
      set.upload_screenshot(path: f, wait_for_processing: false); puts "    new #{type} #{File.basename(f)}"
    end
  end
end
puts 'DONE'
