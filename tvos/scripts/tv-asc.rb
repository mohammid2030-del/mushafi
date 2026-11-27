# Apple TV on the same App Store record: MODE=ensure adds the tvOS platform (version 1.0) if missing;
# MODE=upload replaces the Apple TV screenshots (tvos/shots/*.png, 3840×2160 or 1920×1080) in every language.
require 'spaceship'
mode = ENV['MODE'] || 'ensure'
version = ENV['TV_VERSION'].to_s.empty? ? '1.0' : ENV['TV_VERSION']
Spaceship::ConnectAPI.token = Spaceship::ConnectAPI::Token.create(key_id: ENV['ASC_KEY_ID'], issuer_id: ENV['ASC_ISSUER_ID'], key: File.read(ENV['ASC_KEY_PATH']))
app = Spaceship::ConnectAPI::App.find('com.mohammedasif.mushafi') or abort('app not found')
tv = Spaceship::ConnectAPI::Platform::TV_OS
v = app.get_edit_app_store_version(platform: tv)
if v.nil?
  begin
    app.ensure_version!(version, platform: tv)
  rescue => e
    puts "ensure_version!: #{e.message}"
    Spaceship::ConnectAPI.post_app_store_version(app_id: app.id, attributes: { platform: tv, versionString: version }) rescue puts("create: #{$!.message}")
  end
  v = app.get_edit_app_store_version(platform: tv)
end
abort('could not create the tvOS version (add Apple TV under the app in App Store Connect)') unless v
puts "tvOS version: #{v.version_string} #{v.app_store_state}"
exit if mode == 'ensure'

files = Dir['tvos/shots/*.png'].sort
abort('no screenshots in tvos/shots') if files.empty?
v.get_app_store_version_localizations.each do |loc|
  sets = loc.get_app_screenshot_sets
  set = sets.find { |s| s.screenshot_display_type == 'APP_APPLE_TV' } || loc.create_app_screenshot_set(attributes: { screenshotDisplayType: 'APP_APPLE_TV' })
  (set.app_screenshots || []).each(&:delete!)
  files.each { |f| set.upload_screenshot(path: f, wait_for_processing: false) }
  puts "#{loc.locale}: #{files.size} Apple TV screenshots"
end
puts 'DONE'
