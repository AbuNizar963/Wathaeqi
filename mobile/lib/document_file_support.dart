import 'dart:typed_data';

/// Supported uploaded document formats and their trusted client-side metadata.
class DocumentFileSupport {
  DocumentFileSupport._();

  static const docxMime =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  static const pdfMime = 'application/pdf';

  static String? mimeForFileName(String fileName) {
    final extension = extensionForFileName(fileName);
    return switch (extension) {
      'docx' => docxMime,
      'pdf' => pdfMime,
      'png' => 'image/png',
      'jpg' || 'jpeg' => 'image/jpeg',
      'webp' => 'image/webp',
      _ => null,
    };
  }

  static String extensionForFileName(String fileName) {
    final name = fileName.split(RegExp(r'[/\\]')).last.trim().toLowerCase();
    final dot = name.lastIndexOf('.');
    return dot >= 0 && dot < name.length - 1 ? name.substring(dot + 1) : '';
  }

  static bool isPdf(Uint8List bytes) =>
      bytes.length >= 5 && String.fromCharCodes(bytes.take(5)) == '%PDF-';

  static bool isDocx(Uint8List bytes) =>
      bytes.length >= 4 &&
      bytes[0] == 0x50 &&
      bytes[1] == 0x4b &&
      bytes[2] == 0x03 &&
      bytes[3] == 0x04;

  static bool isPng(Uint8List bytes) =>
      bytes.length >= 8 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4e &&
      bytes[3] == 0x47 &&
      bytes[4] == 0x0d &&
      bytes[5] == 0x0a &&
      bytes[6] == 0x1a &&
      bytes[7] == 0x0a;

  static bool matchesMime(String mimeType, Uint8List bytes) {
    final normalized = mimeType.split(';').first.trim().toLowerCase();
    return switch (normalized) {
      pdfMime => isPdf(bytes),
      docxMime => isDocx(bytes),
      'image/png' => isPng(bytes),
      // JPEG and WebP signatures are intentionally checked here rather than
      // trusting a filename or Content-Type supplied by the client.
      'image/jpeg' =>
        bytes.length >= 3 &&
            bytes[0] == 0xff &&
            bytes[1] == 0xd8 &&
            bytes[2] == 0xff,
      'image/webp' =>
        bytes.length >= 12 &&
            bytes[0] == 0x52 &&
            bytes[1] == 0x49 &&
            bytes[2] == 0x46 &&
            bytes[3] == 0x46 &&
            bytes[8] == 0x57 &&
            bytes[9] == 0x45 &&
            bytes[10] == 0x42 &&
            bytes[11] == 0x50,
      _ => false,
    };
  }
}
