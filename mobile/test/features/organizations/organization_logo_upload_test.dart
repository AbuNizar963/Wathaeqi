import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter_test/flutter_test.dart';
import 'package:police_telegrams/features/organizations/organization_logo_upload.dart';

Future<Uint8List> _transparentPng({int width = 16, int height = 16}) async {
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder);
  final paint = ui.Paint()..color = const ui.Color(0xFFFF0000);
  canvas.drawRect(const ui.Rect.fromLTWH(0, 0, 8, 8), paint);
  final picture = recorder.endRecording();
  final image = await picture.toImage(width, height);
  try {
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
  } finally {
    image.dispose();
    picture.dispose();
  }
}

void _writeUint32(Uint8List target, int offset, int value) {
  target[offset] = (value >> 24) & 0xff;
  target[offset + 1] = (value >> 16) & 0xff;
  target[offset + 2] = (value >> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

Uint8List _pngHeaderWithDimensions(int width, int height) {
  final bytes = Uint8List(24)
    ..setRange(0, 8, const [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ..setRange(8, 16, const [0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  _writeUint32(bytes, 16, width);
  _writeUint32(bytes, 20, height);
  return bytes;
}

Uint8List _jpegSofWithDimensions(int width, int height) {
  final bytes = Uint8List.fromList([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x09,
    0x08,
    0,
    0,
    0,
    0,
    1,
    1,
    0x11,
    0,
  ]);
  bytes[7] = (height >> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (width >> 8) & 0xff;
  bytes[10] = width & 0xff;
  return bytes;
}

void main() {
  test(
    'normalizes PNG logos to bounded PNG while preserving transparency',
    () async {
      final result = await prepareOrganizationLogo(
        source: await _transparentPng(),
        fileName: 'badge.jpeg',
      );
      expect(
        result.bytes.length,
        lessThanOrEqualTo(maxOrganizationLogoOutputBytes),
      );
      expect(result.contentType, 'image/png');
      expect(result.fileName, 'badge.png');
      expect(result.bytes.take(8).toList(), [137, 80, 78, 71, 13, 10, 26, 10]);

      final codec = await ui.instantiateImageCodec(result.bytes);
      try {
        final frame = await codec.getNextFrame();
        try {
          final rgba = await frame.image.toByteData(
            format: ui.ImageByteFormat.rawRgba,
          );
          expect(rgba, isNotNull);
          final pixels = rgba!.buffer.asUint8List(
            rgba.offsetInBytes,
            rgba.lengthInBytes,
          );
          expect(pixels[3], 255);
          expect(pixels[(15 * 16 + 15) * 4 + 3], 0);
        } finally {
          frame.image.dispose();
        }
      } finally {
        codec.dispose();
      }
    },
  );

  test(
    'resizes large raster logos to 2400px without changing aspect ratio',
    () async {
      final result = await prepareOrganizationLogo(
        source: await _transparentPng(width: 3000, height: 1500),
        fileName: 'wide.png',
      );
      final codec = await ui.instantiateImageCodec(result.bytes);
      try {
        final frame = await codec.getNextFrame();
        try {
          expect(frame.image.width, 2400);
          expect(frame.image.height, 1200);
        } finally {
          frame.image.dispose();
        }
      } finally {
        codec.dispose();
      }
    },
  );

  test('rejects huge PNG metadata before invoking an image decoder', () async {
    for (final dimensions in [(40001, 1), (20000, 7000)]) {
      await expectLater(
        prepareOrganizationLogo(
          source: _pngHeaderWithDimensions(dimensions.$1, dimensions.$2),
          fileName: 'huge.png',
        ),
        throwsArgumentError,
      );
    }
  });

  test(
    'rejects oversized JPEG metadata before invoking an image decoder',
    () async {
      await expectLater(
        prepareOrganizationLogo(
          source: _jpegSofWithDimensions(40001, 1),
          fileName: 'huge.jpg',
        ),
        throwsArgumentError,
      );
    },
  );

  test(
    'rejects a corrupt PNG after validating its signature and IHDR',
    () async {
      await expectLater(
        prepareOrganizationLogo(
          source: _pngHeaderWithDimensions(16, 16),
          fileName: 'broken.png',
        ),
        throwsArgumentError,
      );
    },
  );

  test('passes valid SVG through without raster conversion and keeps matching MIME', () async {
    final svg = Uint8List.fromList(
      utf8.encode(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
        '<path d="M0 0h10v10H0z" fill="#123456"/></svg>',
      ),
    );
    final prepared = await prepareOrganizationLogo(
      source: svg,
      fileName: 'agency mark.svg',
    );
    expect(prepared.bytes, orderedEquals(svg));
    expect(prepared.contentType, 'image/svg+xml');
    expect(prepared.fileName, 'agency_mark.svg');
    expect(isSafeOrganizationLogoSvg(prepared.bytes), isTrue);
  });

  test('preserves malicious SVG bytes for server rejection but blocks local preview', () async {
    final maliciousSvg = Uint8List.fromList(
      utf8.encode(
        '<svg xmlns="http://www.w3.org/2000/svg">'
        '<script>alert(1)</script></svg>',
      ),
    );
    final prepared = await prepareOrganizationLogo(
      source: maliciousSvg,
      fileName: 'untrusted.svg',
    );
    expect(prepared.bytes, orderedEquals(maliciousSvg));
    expect(prepared.contentType, 'image/svg+xml');
    expect(isSafeOrganizationLogoSvg(prepared.bytes), isFalse);
  });

  test(
    'accepts source files up to 25 MiB but rejects larger sources',
    () async {
      await expectLater(
        prepareOrganizationLogo(
          source: Uint8List(maxOrganizationLogoSourceBytes + 1),
          fileName: 'oversized.svg',
        ),
        throwsArgumentError,
      );
    },
  );
}
