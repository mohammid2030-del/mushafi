# Replace App Store screenshots from the store-assets branch (screenshots/<device>/<n>.png).
# MODE=inspect lists the editable version, its localizations and screenshot sets; MODE=upload replaces them.
require 'spaceship'
mode = ENV['MODE'] || 'inspect'
Spaceship::ConnectAPI.token = Spaceship::ConnectAPI::Token.create(key_id: ENV['ASC_KEY_ID'], issuer_id: ENV['ASC_ISSUER_ID'], key: File.read(ENV['ASC_KEY_PATH']))
app = Spaceship::ConnectAPI::App.find('com.mohammedasif.mushafi') or abort('app not found')
ios = Spaceship::ConnectAPI::Platform::IOS
v = app.get_edit_app_store_version(platform: ios)
if v.nil? && mode == 'upload' && ENV['NEW_VERSION'].to_s != ''
  app.ensure_version!(ENV['NEW_VERSION'], platform: ios)
  v = app.get_edit_app_store_version(platform: ios)
end
live = app.get_live_app_store_version(platform: ios) rescue nil
puts "live: #{live&.version_string} #{live&.app_store_state}"
abort('no editable version (create one in App Store Connect or pass NEW_VERSION)') unless v
puts "editable: #{v.version_string} #{v.app_store_state}"
DIMS = {[1320,2868]=>'iPhone-6.9',[2064,2752]=>'iPad-13',[1398,2034]=>'iPhone-Duo-outer',[2007,2853]=>'iPhone-Duo-inner'}
TYPES = {'APP_IPHONE_67'=>'iPhone-6.9','APP_IPAD_PRO_3GEN_129'=>'iPad-13'}
root = ENV['SHOTS'] || 'shots/screenshots'
v.get_app_store_version_localizations.each do |loc|
  sets = loc.get_app_screenshot_sets
  puts "== #{loc.locale}"
  done = []
  sets.each do |set|
    shots = set.app_screenshots || []
    dims = shots.map { |s| a = s.image_asset || {}; [a['width'], a['height']] }.uniq
    folder = TYPES[set.screenshot_display_type] || dims.map { |d| DIMS[d] }.compact.first
    puts "  #{set.screenshot_display_type}: #{shots.size} shots #{dims.inspect} -> #{folder.inspect}"
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
