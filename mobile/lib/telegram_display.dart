/// Pure display helpers retained for legacy document preview and Excel import.
/// These functions do not expose routing, delivery, or workflow actions.
String _cleanSerialValue(Object? value) {
  if (value == null) return '';
  final text = value.toString().trim();
  return text == 'null' ? '' : text;
}

String getTelegramSerialCode(Map<String, dynamic> telegram) {
  for (final key in const [
    'originalSerial',
    'organizationSerialCode',
    'serialCode',
    'serialNumber',
  ]) {
    final value = _cleanSerialValue(telegram[key]);
    if (value.isNotEmpty) return value;
  }
  return '';
}

String getTelegramDisplayNumber(String? value, {String? originalSerial}) {
  final imported = _cleanSerialValue(originalSerial);
  if (imported.isNotEmpty) return imported;

  final serial = _cleanSerialValue(value);
  if (serial.isEmpty) return '—';

  final finalSegment = serial.split(RegExp(r'[-/\\]')).last;
  if (!RegExp(r'^\d+$').hasMatch(finalSegment)) return serial;

  final normalized = finalSegment.replaceFirst(RegExp(r'^0+(?=\d)'), '');
  return normalized.isEmpty ? '0' : normalized;
}

String getTelegramEditableSerial(Map<String, dynamic> telegram) {
  final organizationNumber = _cleanSerialValue(
    telegram['organizationSerialNumber'],
  );
  if (organizationNumber.isNotEmpty) return organizationNumber;

  final imported = _cleanSerialValue(telegram['originalSerial']);
  if (imported.isNotEmpty) return getTelegramDisplayNumber(imported);

  return getTelegramDisplayNumber(
    _cleanSerialValue(
      telegram['organizationSerialCode'] ??
          telegram['serialCode'] ??
          telegram['serialNumber'],
    ),
  );
}

String getTelegramDisplaySerial(
  Map<String, dynamic> telegram, [
  Object? numberSystem,
]) {
  final imported = _cleanSerialValue(telegram['originalSerial']);
  if (imported.isNotEmpty) return imported;

  final serial = getTelegramSerialCode(telegram);
  if (serial.isEmpty || numberSystem == null) {
    return serial.isEmpty ? '—' : serial;
  }
  return localizeTelegramDigits(serial, numberSystem.toString());
}

String localizeTelegramDigits(String value, String numberSystem) {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const latinDigits = '0123456789';
  final useArabic = numberSystem == 'arabic';
  final source = useArabic ? latinDigits : arabicDigits;
  final target = useArabic ? arabicDigits : latinDigits;

  return value.split('').map((character) {
    final index = source.indexOf(character);
    return index < 0 ? character : target[index];
  }).join();
}
