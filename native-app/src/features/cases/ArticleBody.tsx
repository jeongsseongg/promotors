import React from 'react';
import {Text, View} from 'react-native';
import {AssetImage, plainText} from '../../components/Media';
import {ui} from '../../theme/styles';

type Segment = {text: string} | {key: string};
function segments(html: string): Segment[] {
  const result: Segment[] = [];
  const image = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null, start = 0;
  while ((match = image.exec(html))) {
    const text = plainText(html.slice(start, match.index)); if (text) result.push({text});
    const key = /\bdata-asset-key\s*=\s*(["'])(.*?)\1/i.exec(match[0])?.[2];
    if (key) result.push({key: plainText(key)});
    start = match.index + match[0].length;
  }
  const tail = plainText(html.slice(start)); if (tail) result.push({text: tail});
  return result;
}
export function ArticleBody({html, imageKeys, title, onPhoto}: {html: string; imageKeys: string[]; title: string; onPhoto: (uri: string) => void}) {
  const blocks = segments(html), inline = new Set(blocks.flatMap(block => 'key' in block ? [block.key] : []));
  return <View style={ui.stack}>
    {imageKeys.filter(key => !inline.has(key)).map(key => <AssetImage key={key} assetKey={key} label={title} onPress={onPhoto}/>)}
    {blocks.map((block, index) => 'key' in block ? <AssetImage key={block.key + index} assetKey={block.key} label={title} onPress={onPhoto}/> :
      <View key={index} style={ui.card}><Text selectable style={ui.body}>{block.text}</Text></View>)}
  </View>;
}
