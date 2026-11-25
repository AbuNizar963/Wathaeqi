import 'dart:typed_data';

bool isSafeDocumentOutputId(String id) =>
    id.isNotEmpty &&
    id != '.' &&
    id != '..' &&
    !id.startsWith('local_') &&
    RegExp(r'^[A-Za-z0-9._-]{1,36}$').hasMatch(id);

bool hasPdfSignature(Uint8List bytes) =>
    bytes.length >= 5 && String.fromCharCodes(bytes.take(5)) == '%PDF-';
