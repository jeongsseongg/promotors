import React from 'react';
import {ActivityIndicator, Image, ImageSourcePropType, Pressable, StyleSheet, Text, TextInput, TextInputProps, useWindowDimensions, View} from 'react-native';
import {color, font} from '../theme/tokens';
import {ui} from '../theme/styles';

type ButtonProps = {label: string; onPress: () => void; secondary?: boolean; accent?: boolean; danger?: boolean; disabled?: boolean; busy?: boolean; testID?: string; brand?: boolean; hero?: boolean; appearance?: 'modal' | 'reserve-auth'; children?: React.ReactNode};
export function Button({label, onPress, secondary, accent, danger, disabled, busy, testID, brand, hero, appearance, children}: ButtonProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: !!disabled || !!busy}} testID={testID}
    disabled={disabled || busy} onPress={onPress}
    style={({pressed}) => [styles.button, secondary && styles.secondary, accent && styles.accent, danger && styles.danger, brand && styles.brand, hero && styles.heroButton, appearance && styles.modalPrimary, appearance && secondary && styles.modalCancel, appearance === 'reserve-auth' && styles.reserveAuthButton, (disabled || busy) && styles.disabled, pressed && styles.pressed]}>
    {busy ? <ActivityIndicator color={secondary ? color.navy : color.surface}/> : children || <Text style={[styles.buttonText, (secondary || accent) && styles.secondaryText, brand && styles.brandText, brand && !secondary && styles.brandPrimaryText, appearance && styles.modalPrimaryText, appearance && secondary && styles.modalCancelText]}>{label}</Text>}
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
export function MenuRow({title, detail, onPress, danger, icon, compact, brand, badge, selected, last}: {title: string; detail?: string; onPress: () => void; danger?: boolean; icon?: ImageSourcePropType; compact?: boolean; brand?: boolean; badge?: string; selected?: boolean; last?: boolean}) {
  const narrow = useWindowDimensions().width <= 360;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed}) => [styles.menu, compact && styles.compactMenu, brand && styles.brandMenu, brand && narrow && styles.narrowBrandMenu, brand && last && styles.lastBrandMenu, brand && selected && styles.selectedBrandMenu, pressed && styles.pressed]}>
    {icon ? <View style={brand && styles.brandIconSlot}><Image source={icon} style={[styles.menuIcon, brand && styles.brandMenuIcon]} accessible={false}/></View> : null}
    <View style={[ui.flex, compact && styles.compactContent]}><Text style={[ui.label, compact && styles.compactTitle, brand && styles.brandMenuTitle, danger && ui.error]}>{title}</Text>{badge ? <Text style={styles.brandBadge}>{badge}</Text> : null}{detail ? <Text numberOfLines={compact ? 1 : undefined} style={[ui.muted, compact && styles.compactDetail, brand && styles.brandMenuDetail, brand && narrow && styles.narrowBrandDetail, brand && selected && styles.selectedBrandDetail]}>{detail}</Text> : null}</View>
    <Text accessibilityElementsHidden style={[styles.chevron, brand && styles.brandChevron]}>›</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: {minHeight: 54, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: color.navy},
  buttonText: {fontFamily: font.bold, fontSize: 17, lineHeight: 25, color: color.surface, textAlign: 'center'},
  brand: {minHeight: 50, borderRadius: 9, paddingVertical: 12}, brandText: {fontSize: 15, lineHeight: 23}, brandPrimaryText: {color: color.yellow},
  modalPrimary: {minHeight: 52, paddingVertical: 12, borderRadius: 12},
  modalPrimaryText: {fontFamily: font.extraBold, fontSize: 16, lineHeight: 24},
  modalCancel: {minHeight: 48, borderRadius: 8, paddingHorizontal: 20, borderColor: '#D6DBE1'},
  modalCancelText: {fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: '#555F6B'},
  reserveAuthButton: {minHeight: 52, paddingHorizontal: 6},
  heroButton: {minHeight: 64, borderRadius: 12, paddingVertical: 18, paddingHorizontal: 32},
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
  brandMenu: {minHeight: 56, gap: 10, paddingHorizontal: 16, paddingVertical: 0, borderBottomWidth: 1, borderBottomColor: '#F4F4F5'},
  narrowBrandMenu: {paddingHorizontal: 14, gap: 8}, lastBrandMenu: {borderBottomWidth: 0}, selectedBrandMenu: {backgroundColor: '#FFF9DF'},
  brandIconSlot: {width: 22, alignItems: 'center'}, brandMenuIcon: {width: 20, height: 20},
  brandMenuTitle: {fontFamily: font.semibold, fontSize: 15, lineHeight: 20},
  brandMenuDetail: {fontFamily: font.semibold, fontSize: 12, lineHeight: 18, maxWidth: 112, marginLeft: 'auto', color: '#37383C9C'},
  narrowBrandDetail: {maxWidth: 82}, brandChevron: {fontFamily: font.regular, fontSize: 20, lineHeight: 24, color: '#AEB0B6'},
  selectedBrandDetail: {fontFamily: font.extraBold, color: color.navy, backgroundColor: color.yellow, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, flex: 0},
  brandBadge: {fontFamily: font.bold, fontSize: 10, lineHeight: 14, color: color.navy, backgroundColor: '#EEF0F6', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12},
});
