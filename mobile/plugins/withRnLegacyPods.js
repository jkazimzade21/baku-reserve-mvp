const { withPodfile } = require('@expo/config-plugins');

const POD_SNIPPET = `  # withRnLegacyPods - ensure RN third-party specs resolve on clean clones
  rn_third_party_podspecs = File.join('..', 'node_modules', 'react-native', 'third-party-podspecs')
  pod 'RCT-Folly', :podspec => File.join(rn_third_party_podspecs, 'RCT-Folly.podspec')
  pod 'boost', :podspec => File.join(rn_third_party_podspecs, 'boost.podspec')
  pod 'DoubleConversion', :podspec => File.join(rn_third_party_podspecs, 'DoubleConversion.podspec')
  pod 'glog', :podspec => File.join(rn_third_party_podspecs, 'glog.podspec')
  pod 'fmt', :podspec => File.join(rn_third_party_podspecs, 'fmt.podspec')
  pod 'fast_float', :podspec => File.join(rn_third_party_podspecs, 'fast_float.podspec')`;

const ENV_SNIPPET = `# withRnLegacyPods - always build RN deps from source to avoid missing headers
ENV['RCT_USE_RN_DEP'] = '0'
ENV['RCT_USE_PREBUILT_RNCORE'] = '0'`;

module.exports = function withRnLegacyPods(config) {
  return withPodfile(config, (modConfig) => {
    let contents = modConfig.modResults.contents;

    if (!contents.includes('withRnLegacyPods - ensure RN third-party specs')) {
      contents = contents.replace(
        /(^\s*use_react_native!\s*\()/m,
        `${POD_SNIPPET}\n\n  use_react_native!(`,
      );
    }

    if (!contents.includes('withRnLegacyPods - always build RN deps')) {
      const envAnchor = "ENV['RCT_USE_PREBUILT_RNCORE'] ||= '1'";
      contents = contents.replace(envAnchor, `${envAnchor}\n\n${ENV_SNIPPET}`);
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });
};
