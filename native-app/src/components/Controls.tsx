import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View} from 'react-native';
import {color, font} from '../theme/tokens';
import {ui} from '../theme/styles';

type ButtonProps = {label: string; onPress: () => void; secondary?: boolean; accent?: boolean; danger?: boolean; disabled?: boolean; busy?: boolean; testID?: string};
export function Button({label, onPress, secondary, accent, danger, disabled, busy, testID}: ButtonProps) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled: !!disabled || !!busy}} testID={testID}
    disabled={disabled || busy} onPress={onPress}
    style={({pressed}) => [styles.button, secondary && styles.secondary, accent && styles.accent, danger && styles.danger, (disabled || busy) && styles.disabled, pressed && styles.pressed]}>
    {busy ? <ActivityIndicator color={secondary ? color.navy : color.surface}/> : <Text style={[styles.buttonText, (secondary || accent) && styles.secondaryText]}>{label}</Text>}
  </Pressable>;
}
export function Field({label, error, ...props}: TextInputProps & {label: string; error?: string}) {
  return <View style={styles.field}><Text style={ui.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={color.muted} {...props}
      style={[styles.input, props.multiline && styles.multiline, props.style]}/>
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
  </View>;
}
export function Choice({label, selected, onPress, disabled}: {label: string; selected: boolean; onPress: () => void; disabled?: boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{selected, disabled: !!disabled}} disabled={disabled}
    onPress={onPress} style={[styles.choice, selected && styles.choiceSelected, disabled && styles.disabled]}>
    <Text style={[styles.choiceText, selected && styles.choiceSelectedText]}>{label}</Text>
  </Pressable>;
}
export function MenuRow({title, detail, onPress, danger}: {title: string; detail?: string; onPress: () => void; danger?: boolean}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed}) => [styles.menu, pressed && styles.pressed]}>
    <View style={ui.flex}><Text style={[ui.label, danger && ui.error]}>{title}</Text>{detail ? <Text style={ui.muted}>{detail}</Text> : null}</View>
    <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: {minHeight: 54, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: color.navy},
  buttonText: {fontFamily: font.bold, fontSize: 17, lineHeight: 25, color: color.surface, textAlign: 'center'},
  secondary: {backgroundColor: color.surface, borderColor: color.border, borderWidth: 1},
  accent: {backgroundColor: color.yellow}, secondaryText: {color: color.navy}, danger: {backgroundColor: color.danger},
  disabled: {opacity: 0.42}, pressed: {opacity: 0.72}, field: {gap: 8},
  input: {minHeight: 54, borderWidth: 1, borderColor: color.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontFamily: font.regular, fontSize: 16, color: color.text, backgroundColor: color.surface},
  multiline: {minHeight: 112, textAlignVertical: 'top'},
  choice: {minHeight: 48, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center'},
  choiceSelected: {backgroundColor: color.navy, borderColor: color.navy},
  choiceText: {fontFamily: font.semibold, fontSize: 16, color: color.navy}, choiceSelectedText: {color: color.surface},
  menu: {minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12},
  chevron: {fontSize: 28, color: color.muted},
});
