import React from 'react';
import {ActivityIndicator, Image, ImageSourcePropType, Pressable, StyleSheet, Text, TextInput, TextInputProps, View} from 'react-native';
import {color, font} from '../theme/tokens';
import {ui} from '../theme/styles';

type ButtonProps = {label: string; onPress: () => void; secondary?: boolean; accent?: boolean; danger?: boolean; disabled?: boolean; busy?: boolean; testID?: string; brand?: boolean; hero?: boolean; children?: React.ReactNode};
export function Button({label, onPress, secondary, accent, danger, disabled, busy, testID, brand, hero, children}: ButtonProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: !!disabled || !!busy}} testID={testID}
    disabled={disabled || busy} onPress={onPress}
    style={({pressed}) => [styles.button, secondary && styles.secondary, accent && styles.accent, danger && styles.danger, brand && styles.brand, hero && styles.heroButton, (disabled || busy) && styles.disabled, pressed && styles.pressed]}>
    {busy ? <ActivityIndicator color={secondary ? color.navy : color.surface}/> : children || <Text style={[styles.buttonText, (secondary || accent) && styles.secondaryText, brand && styles.brandText, brand && !secondary && styles.brandPrimaryText]}>{label}</Text>}
  </Pressable>;
}
export function Field({label, error, hideLabel, ...props}: TextInputProps & {label: string; error?: string; hideLabel?: boolean}) {
  return <View style={styles.field}>{!hideLabel ? <Text style={ui.label}>{label}</Text> : null}
    <TextInput accessibilityLabel={label} placeholderTextColor={color.muted} {...props}
      style={[styles.input, props.multiline && styles.multiline, props.style]}/>
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
  </View>;
}
export function Choice({label, selected, onPress, disabled, compact, appearance}: {label: string; selected: boolean; onPress: () => void; disabled?: boolean; compact?: boolean; appearance?: 'branch' | 'slot'}) {
  return <Pressable accessibilityRole="button" accessibilityState={{selected, disabled: !!disabled}} disabled={disabled}
    onPress={onPress} style={[styles.choice, selected && styles.choiceSelected, appearance === 'branch' && styles.branchChoice, appearance === 'slot' && styles.slotChoice, compact && styles.compactChoice, disabled && styles.disabled]}>
    <Text style={[styles.choiceText, selected && styles.choiceSelectedText, appearance === 'branch' && styles.branchChoiceText, appearance === 'slot' && styles.slotChoiceText, appearance === 'slot' && selected && styles.slotChoiceSelectedText, compact && styles.compactChoiceText]}>{label}</Text>
  </Pressable>;
}
export function MenuRow({title, detail, onPress, danger, icon, compact}: {title: string; detail?: string; onPress: () => void; danger?: boolean; icon?: ImageSourcePropType; compact?: boolean}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed}) => [styles.menu, compact && styles.compactMenu, pressed && styles.pressed]}>
    {icon ? <Image source={icon} style={styles.menuIcon} accessible={false}/> : null}
    <View style={[ui.flex, compact && styles.compactContent]}><Text style={[ui.label, compact && styles.compactTitle, danger && ui.error]}>{title}</Text>{detail ? <Text numberOfLines={compact ? 1 : undefined} style={[ui.muted, compact && styles.compactDetail]}>{detail}</Text> : null}</View>
    <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: {minHeight: 54, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: color.navy},
  buttonText: {fontFamily: font.bold, fontSize: 17, lineHeight: 25, color: color.surface, textAlign: 'center'},
  brand: {minHeight: 50, borderRadius: 9, paddingVertical: 12}, brandText: {fontSize: 15, lineHeight: 23}, brandPrimaryText: {color: color.yellow},
  heroButton: {minHeight: 70, borderRadius: 12, borderBottomWidth: 6, borderBottomColor: color.yellow},
  secondary: {backgroundColor: color.surface, borderColor: color.border, borderWidth: 1},
  accent: {backgroundColor: color.yellow}, secondaryText: {color: color.navy}, danger: {backgroundColor: color.danger},
  disabled: {opacity: 0.42}, pressed: {opacity: 0.72}, field: {gap: 8},
  input: {minHeight: 54, borderWidth: 1, borderColor: color.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontFamily: font.regular, fontSize: 16, color: color.text, backgroundColor: color.surface},
  multiline: {minHeight: 112, textAlignVertical: 'top'},
  choice: {minHeight: 48, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center'},
  choiceSelected: {backgroundColor: color.navy, borderColor: color.navy},
  branchChoice: {width: '100%', minHeight: 56, borderRadius: 10, borderWidth: 1.5, borderColor: color.navy, paddingVertical: 14},
  branchChoiceText: {fontFamily: font.bold, fontSize: 17, lineHeight: 25},
  slotChoice: {minHeight: 44, borderRadius: 8, paddingHorizontal: 2, paddingVertical: 9},
  slotChoiceText: {fontFamily: font.medium, fontSize: 13, lineHeight: 18, textAlign: 'center'}, slotChoiceSelectedText: {fontFamily: font.bold, color: color.yellow},
  compactChoice: {minHeight: 44, paddingHorizontal: 0, paddingVertical: 0, borderWidth: 0, borderRadius: 0, backgroundColor: color.surface},
  compactChoiceText: {fontFamily: font.regular, fontSize: 13, color: color.muted},
  choiceText: {fontFamily: font.semibold, fontSize: 16, color: color.navy}, choiceSelectedText: {color: color.surface},
  menu: {minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12},
  chevron: {fontSize: 28, color: color.muted},
  compactMenu: {minHeight: 56, gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border},
  menuIcon: {width: 22, height: 22}, compactContent: {flexDirection: 'row', alignItems: 'center', gap: 8},
  compactTitle: {flexShrink: 0, fontSize: 15}, compactDetail: {flex: 1, fontSize: 12, textAlign: 'right'},
});
