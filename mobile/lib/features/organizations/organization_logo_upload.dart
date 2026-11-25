import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:xml/xml.dart';

const maxOrganizationLogoSourceBytes = 25 * 1024 * 1024;
const maxOrganizationLogoOutputBytes = 5 * 1024 * 1024;
const _initialMaxLogoDimension = 2400;
const _minimumLogoDimension = 1024;
const _maxResizeAttempts = 5;
const _svgNamespace = 'http://www.w3.org/2000/svg';

/// A source format determined from its actual bytes, never from its extension
/// alone. Raster uploads are normalized to transparent PNG; SVG remains SVG.
enum OrganizationLogoFormat {
  png('image/png', 'png'),
  jpeg('image/jpeg', 'jpg'),
  svg('image/svg+xml', 'svg');

  const OrganizationLogoFormat(this.contentType, this.extension);

  final String contentType;
  final String extension;
}

class PreparedOrganizationLogo {
  const PreparedOrganizationLogo({
    required this.bytes,
    required this.contentType,
    required this.fileName,
    required this.format,
  });

  final Uint8List bytes;
  final String contentType;
  final String fileName;
  final OrganizationLogoFormat format;
}

/// Classifies supported logo bytes. PNG/JPEG signatures take precedence over
/// the untrusted file extension; SVG must have an SVG root element.
OrganizationLogoFormat detectOrganizationLogoFormat(
  Uint8List source, {
  required String fileName,
}) {
  if (source.isEmpty) throw ArgumentError('ملف الشعار فارغ');
  if (source.length > maxOrganizationLogoSourceBytes) {
    throw ArgumentError('حجم ملف الشعار الأصلي يجب ألا يتجاوز 25 ميغابايت');
  }

  if (_startsWith(source, const [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ])) {
    return OrganizationLogoFormat.png;
  }
  if (_startsWith(source, const [0xff, 0xd8, 0xff])) {
    return OrganizationLogoFormat.jpeg;
  }
  if (_looksLikeSvg(source)) return OrganizationLogoFormat.svg;

  final extension = _extensionOf(fileName);
  if (extension == 'svg') {
    throw ArgumentError('ملف SVG المختار غير صالح');
  }
  throw ArgumentError('صيغة الشعار يجب أن تكون SVG أو PNG أو JPG/JPEG');
}

/// Prepares an upload with a MIME type and extension that match the payload.
/// SVG is forwarded as-is; PNG/JPEG is decoded only after metadata validation,
/// then re-encoded as a transparent PNG with bounded resize attempts.
Future<PreparedOrganizationLogo> prepareOrganizationLogo({
  required Uint8List source,
  required String fileName,
}) async {
  final format = detectOrganizationLogoFormat(source, fileName: fileName);
  if (format == OrganizationLogoFormat.svg) {
    if (source.length > maxOrganizationLogoOutputBytes) {
      throw ArgumentError('حجم ملف الشعار الناتج يجب ألا يتجاوز 5 ميغابايت');
    }
    return PreparedOrganizationLogo(
      bytes: Uint8List.fromList(source),
      contentType: format.contentType,
      fileName: _normalizedLogoFileName(fileName, format),
      format: format,
    );
  }

  final dimensions = format == OrganizationLogoFormat.png
      ? _pngDimensions(source)
      : _jpegDimensions(source);
  _validateSourceDimensions(dimensions.width, dimensions.height);

  final resized = await _normalizeRasterLogo(source, dimensions);
  return PreparedOrganizationLogo(
    bytes: resized,
    contentType: OrganizationLogoFormat.png.contentType,
    fileName: _normalizedLogoFileName(fileName, OrganizationLogoFormat.png),
    format: OrganizationLogoFormat.png,
  );
}

/// Backwards-compatible convenience for callers that only need normalized
/// bytes. New upload call sites should use [prepareOrganizationLogo] so MIME
/// and extension cannot drift from the returned payload.
Future<Uint8List> prepareOrganizationLogoBytes(
  Uint8List source, {
  String fileName = 'organization-logo.png',
}) async =>
    (await prepareOrganizationLogo(source: source, fileName: fileName)).bytes;

/// Returns true only for SVG that is safe to hand to the local SVG renderer.
/// This deliberately conservative preview filter is not server-side upload
/// validation: the server remains authoritative and must reject unsafe SVG.
bool isSafeOrganizationLogoSvg(Uint8List bytes) {
  if (bytes.isEmpty || bytes.length > maxOrganizationLogoOutputBytes) {
    return false;
  }
  try {
    final source = utf8.decode(bytes, allowMalformed: false);
    if (!_looksLikeSvg(bytes) ||
        RegExp(
          r'<!\s*(?:DOCTYPE|ENTITY)',
          caseSensitive: false,
        ).hasMatch(source) ||
        RegExp(r'<\?(?!xml\s)', caseSensitive: false).hasMatch(source)) {
      return false;
    }

    final document = XmlDocument.parse(source);
    final root = document.rootElement;
    if (root.name.local.toLowerCase() != 'svg' ||
        (root.name.namespaceUri != null &&
            root.name.namespaceUri != _svgNamespace)) {
      return false;
    }

    const forbiddenElements = {
      'script',
      'foreignobject',
      'image',
      'iframe',
      'object',
      'embed',
      'audio',
      'video',
      'style',
      'animate',
      'animatemotion',
      'animatetransform',
      'set',
    };
    final pending = <(XmlElement, int)>[(root, 0)];
    var visitedElements = 0;
    while (pending.isNotEmpty) {
      final (element, depth) = pending.removeLast();
      visitedElements++;
      if (visitedElements > 4096 || depth > 48) return false;
      final localName = element.name.local.toLowerCase();
      final namespace = element.name.namespaceUri;
      if (forbiddenElements.contains(localName) ||
          (namespace != null && namespace != _svgNamespace)) {
        return false;
      }
      for (final attribute in element.attributes) {
        final name = attribute.name.local.toLowerCase();
        final value = attribute.value.trim();
        if (name.startsWith('on') || name == 'style' || name == 'base') {
          return false;
        }
        if (name == 'href') {
          if (!RegExp(r'^#[A-Za-z_][A-Za-z0-9_.:-]*$').hasMatch(value)) {
            return false;
          }
        }
        if (RegExp(r'url\s*\(', caseSensitive: false).hasMatch(value)) {
          final references = RegExp(
            r'''url\(\s*["']?(.*?)["']?\s*\)''',
            caseSensitive: false,
          ).allMatches(value);
          if (references.isEmpty ||
              references.any(
                (match) => !match.group(1)!.trim().startsWith('#'),
              ) ||
              value
                  .replaceAll(
                    RegExp(r'url\s*\([^)]*\)', caseSensitive: false),
                    '',
                  )
                  .contains('url')) {
            return false;
          }
        }
        if (RegExp(
          r'@import|expression\s*\(',
          caseSensitive: false,
        ).hasMatch(value)) {
          return false;
        }
      }
      for (final child in element.children.whereType<XmlElement>()) {
        pending.add((child, depth + 1));
      }
    }
    return true;
  } catch (_) {
    return false;
  }
}

bool isSupportedOrganizationLogoPayload(String contentType, Uint8List bytes) {
  final normalizedType = contentType.split(';').first.trim().toLowerCase();
  if (normalizedType == 'image/svg+xml') {
    return isSafeOrganizationLogoSvg(bytes);
  }
  if (normalizedType == 'image/png') {
    return _isPngSignature(bytes);
  }
  if (normalizedType == 'image/jpeg' || normalizedType == 'image/jpg') {
    return _isJpegSignature(bytes);
  }
  if (normalizedType.isEmpty ||
      normalizedType == 'application/octet-stream' ||
      normalizedType == 'binary/octet-stream') {
    return _isPngSignature(bytes) ||
        _isJpegSignature(bytes) ||
        isSafeOrganizationLogoSvg(bytes);
  }
  return false;
}

/// Lightweight format check used only to pair upload bytes with MIME metadata.
/// It intentionally does not certify SVG safety; the upload endpoint must
/// perform authoritative sanitization and rejection.
bool isOrganizationLogoSvgPayload(Uint8List bytes) =>
    bytes.isNotEmpty &&
    bytes.length <= maxOrganizationLogoOutputBytes &&
    _looksLikeSvg(bytes);

bool _looksLikeSvg(Uint8List bytes) {
  try {
    var source = utf8.decode(bytes, allowMalformed: false);
    if (source.startsWith('\uFEFF')) source = source.substring(1);
    source = source.trimLeft();
    source = source
        .replaceFirst(RegExp(r'^<\?xml\s+[^?]*\?>', caseSensitive: false), '')
        .trimLeft();
    return RegExp(r'^<svg(?:\s|>|/)', caseSensitive: false).hasMatch(source);
  } catch (_) {
    return false;
  }
}

bool _isPngSignature(Uint8List bytes) =>
    _startsWith(bytes, const [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

bool _isJpegSignature(Uint8List bytes) =>
    _startsWith(bytes, const [0xff, 0xd8, 0xff]);

bool _startsWith(Uint8List bytes, List<int> signature) {
  if (bytes.length < signature.length) return false;
  for (var index = 0; index < signature.length; index++) {
    if (bytes[index] != signature[index]) return false;
  }
  return true;
}

String _extensionOf(String fileName) {
  final baseName = fileName.replaceAll('\\', '/').split('/').last;
  final dot = baseName.lastIndexOf('.');
  return dot < 0 ? '' : baseName.substring(dot + 1).toLowerCase();
}

String _normalizedLogoFileName(
  String inputName,
  OrganizationLogoFormat format,
) {
  final baseName = inputName.replaceAll('\\', '/').split('/').last;
  final dot = baseName.lastIndexOf('.');
  final inputStem = dot <= 0 ? baseName : baseName.substring(0, dot);
  final stem = inputStem
      .replaceAll(RegExp(r'[^A-Za-z0-9_-]+'), '_')
      .replaceAll(RegExp(r'_+'), '_')
      .replaceAll(RegExp(r'^[_-]+|[_-]+$'), '');
  return '${stem.isEmpty ? 'organization-logo' : stem}.${format.extension}';
}

class _LogoDimensions {
  const _LogoDimensions(this.width, this.height);

  final int width;
  final int height;
}

int _readUint32(Uint8List bytes, int offset) =>
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3];

int _readUint16(Uint8List bytes, int offset) =>
    (bytes[offset] << 8) | bytes[offset + 1];

_LogoDimensions _pngDimensions(Uint8List source) {
  if (!_isPngSignature(source) ||
      source.length < 24 ||
      _readUint32(source, 8) != 13 ||
      source[12] != 0x49 ||
      source[13] != 0x48 ||
      source[14] != 0x44 ||
      source[15] != 0x52) {
    throw ArgumentError('ملف PNG للشعار تالف أو غير صالح');
  }
  return _LogoDimensions(_readUint32(source, 16), _readUint32(source, 20));
}

_LogoDimensions _jpegDimensions(Uint8List source) {
  if (!_isJpegSignature(source) || source.length < 4) {
    throw ArgumentError('ملف JPEG للشعار تالف أو غير صالح');
  }
  var offset = 2;
  while (offset < source.length) {
    if (source[offset] != 0xff) {
      throw ArgumentError('ملف JPEG للشعار تالف أو غير صالح');
    }
    while (offset < source.length && source[offset] == 0xff) {
      offset++;
    }
    if (offset >= source.length) break;
    final marker = source[offset++];
    if (marker == 0xd9 || marker == 0xda) break;
    if (marker == 0x00) {
      throw ArgumentError('ملف JPEG للشعار تالف أو غير صالح');
    }
    if (marker == 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > source.length) break;
    final segmentLength = _readUint16(source, offset);
    if (segmentLength < 2 || offset + segmentLength > source.length) {
      throw ArgumentError('ملف JPEG للشعار تالف أو غير صالح');
    }
    final isStartOfFrame =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (segmentLength < 7) {
        throw ArgumentError('ملف JPEG للشعار تالف أو غير صالح');
      }
      return _LogoDimensions(
        _readUint16(source, offset + 5),
        _readUint16(source, offset + 3),
      );
    }
    offset += segmentLength;
  }
  throw ArgumentError('ملف JPEG للشعار تالف أو لا يحتوي أبعادًا صالحة');
}

void _validateSourceDimensions(int width, int height) {
  if (width <= 0 ||
      height <= 0 ||
      width > 40000 ||
      height > 40000 ||
      width * height > 120000000) {
    throw ArgumentError('أبعاد صورة الشعار كبيرة جدًا؛ استخدم صورة أصغر');
  }
}

Future<Uint8List> _normalizeRasterLogo(
  Uint8List source,
  _LogoDimensions dimensions,
) async {
  final sourceMaxDimension = dimensions.width > dimensions.height
      ? dimensions.width
      : dimensions.height;
  final resizeDimensions = <int>[];
  var maxDimension = sourceMaxDimension < _initialMaxLogoDimension
      ? sourceMaxDimension
      : _initialMaxLogoDimension;
  while (resizeDimensions.length < _maxResizeAttempts) {
    if (!resizeDimensions.contains(maxDimension)) {
      resizeDimensions.add(maxDimension);
    }
    if (maxDimension <= _minimumLogoDimension) break;
    maxDimension = (maxDimension * 0.75).floor();
    if (maxDimension < _minimumLogoDimension) {
      maxDimension = _minimumLogoDimension;
    }
  }

  for (final requestedMaxDimension in resizeDimensions) {
    final scale = (requestedMaxDimension / sourceMaxDimension).clamp(0.0, 1.0);
    final targetWidth = (dimensions.width * scale).round().clamp(
      1,
      dimensions.width,
    );
    final targetHeight = (dimensions.height * scale).round().clamp(
      1,
      dimensions.height,
    );
    try {
      final codec = await ui.instantiateImageCodec(
        source,
        targetWidth: targetWidth,
        targetHeight: targetHeight,
        allowUpscaling: false,
      );
      try {
        final frame = await codec.getNextFrame();
        try {
          final data = await frame.image.toByteData(
            format: ui.ImageByteFormat.png,
          );
          if (data == null) {
            throw StateError('تعذر تجهيز شعار الجهة للرفع.');
          }
          final bytes = data.buffer.asUint8List(
            data.offsetInBytes,
            data.lengthInBytes,
          );
          if (bytes.length <= maxOrganizationLogoOutputBytes) {
            return Uint8List.fromList(bytes);
          }
        } finally {
          frame.image.dispose();
        }
      } finally {
        codec.dispose();
      }
    } catch (error) {
      if (error is ArgumentError || error is StateError) rethrow;
      throw ArgumentError('ملف صورة الشعار تالف أو غير صالح');
    }
  }
  throw StateError('تعذر ضغط الشعار إلى الحد المسموح؛ اختر صورة أصغر');
}
