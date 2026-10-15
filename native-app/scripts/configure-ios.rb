require 'xcodeproj'
require 'json'
require 'pathname'

root = File.expand_path('..', __dir__)
project = Xcodeproj::Project.open(File.join(root, 'ios/Promotors.xcodeproj'))
app = project.targets.find { |target| target.name == 'Promotors' }
raise 'Promotors target missing' unless app
version = JSON.parse(File.read(File.join(root, 'release.json')))
widget = project.targets.find { |target| target.name == 'BookingActivity' } ||
  project.new_target(:app_extension, 'BookingActivity', :ios, '16.2')

def add_file(project, target, path, resources = false)
  ref = project.files.find { |file| file.path == path } || project.main_group.new_file(path)
  phase = resources ? target.resources_build_phase : target.source_build_phase
  phase.add_file_reference(ref) unless phase.files_references.include?(ref)
end
Dir.glob(File.join(root, 'ios/Promotors/Notifications/*.{swift,m}')).each do |file|
  add_file(project, app, Pathname.new(file).relative_path_from(Pathname.new(File.join(root, 'ios'))).to_s)
end
add_file(project, app, 'Promotors/BookingActivityAttributes.swift')
add_file(project, widget, 'Promotors/BookingActivityAttributes.swift')
add_file(project, widget, 'BookingActivity/BookingActivityWidget.swift')
add_file(project, app, 'Promotors/02-precision-check.wav', true)
Dir.glob(File.join(root, 'assets/fonts/*.otf')).each do |file|
  add_file(project, app, '../assets/fonts/' + File.basename(file), true)
end
app.add_dependency(widget) unless app.dependencies.any? { |dependency| dependency.target == widget }
embed = app.copy_files_build_phases.find { |phase| phase.name == 'Embed App Extensions' } ||
  app.new_copy_files_build_phase('Embed App Extensions')
embed.dst_subfolder_spec = '13'
unless embed.files_references.include?(widget.product_reference)
  embed.add_file_reference(widget.product_reference).settings = {'ATTRIBUTES' => ['RemoveHeadersOnCopy']}
end
project.root_object.known_regions = ['ko', 'en', 'Base']
[[app, 'kr.promotors.app'], [widget, 'kr.promotors.app.BookingActivity']].each do |target, bundle|
  target.build_configurations.each do |configuration|
    settings = configuration.build_settings
    settings['PRODUCT_BUNDLE_IDENTIFIER'] = bundle
    settings['DEVELOPMENT_TEAM'] = 'Z8QYZ8K855'
    settings['MARKETING_VERSION'] = version.fetch('version')
    settings['CURRENT_PROJECT_VERSION'] = version.fetch('iosBuild').to_s
    settings['SWIFT_VERSION'] = '5.0'
    settings['TARGETED_DEVICE_FAMILY'] = '1,2'
    settings['CODE_SIGN_STYLE'] = 'Automatic'
    if target == widget
      settings['INFOPLIST_FILE'] = 'BookingActivity/BookingActivity-Info.plist'
      settings['SKIP_INSTALL'] = 'YES'
      settings['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
      settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.2'
      settings['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
    else
      settings['CODE_SIGN_ENTITLEMENTS'] = 'Promotors/Promotors.entitlements'
    end
  end
end
bundle_phase = app.shell_script_build_phases.find { |phase| phase.name == 'Bundle React Native code and images' }
raise 'React Native bundle phase missing' unless bundle_phase
guard = 'if [ "$CONFIGURATION" = "Release" ] && [ "${ENTRY_FILE:-index.js}" != "index.js" ]; then echo "QA entry cannot be released" >&2; exit 1; fi'
bundle_phase.shell_script = guard + "\n" + bundle_phase.shell_script unless bundle_phase.shell_script.include?('QA entry cannot be released')
project.save
puts 'Configured native app, existing booking extension, fonts and release identity.'
