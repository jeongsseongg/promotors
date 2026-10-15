const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const team = 'Z8QYZ8K855';
const profiles = {};
for (const [bundle, file] of [['kr.promotors.app','distribution.mobileprovision'],['kr.promotors.app.BookingActivity','activity.mobileprovision']]) {
  const decoded = execFileSync('security',['cms','-D','-i',path.join(process.env.RUNNER_TEMP,file)]);
  const summary = JSON.parse(execFileSync('python3',['-c',"import plistlib,json,sys; p=plistlib.loads(sys.stdin.buffer.read()); print(json.dumps({'uuid':p['UUID'],'team':p['TeamIdentifier'][0],'bundle':p['Entitlements']['application-identifier'],'aps':p['Entitlements'].get('aps-environment')}))"],{input:decoded}).toString());
  if (summary.team !== team || summary.bundle !== `${team}.${bundle}`) throw Error('Distribution profile identity mismatch');
  if (bundle === 'kr.promotors.app' && summary.aps !== 'production') throw Error('Main distribution profile does not include production push');
  profiles[bundle] = summary.uuid;
  fs.copyFileSync(path.join(process.env.RUNNER_TEMP,file),path.join(process.env.HOME,'Library/MobileDevice/Provisioning Profiles',`${summary.uuid}.mobileprovision`));
}
const project = 'ios/Promotors.xcodeproj/project.pbxproj';
let count = 0;
const source = fs.readFileSync(project,'utf8').replace(/(buildSettings = \{)([\s\S]*?)(\n\t\t\t\};)/g,(all,open,settings,close)=>{
  const bundle = settings.match(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/)?.[1];
  if (!profiles[bundle]) return all;
  count++;
  settings = settings.replace(/CODE_SIGN_STYLE = Automatic;/,'CODE_SIGN_STYLE = Manual;');
  settings += `\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "${profiles[bundle]}";`;
  return open + settings + close;
});
if (count !== 4) throw Error(`Expected four app/widget configurations, found ${count}`);
fs.writeFileSync(project,source);
fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'signing-profiles.json'),JSON.stringify(profiles));
console.log('Configured existing distribution identity for app and booking widget; no development certificate/device registration.');
