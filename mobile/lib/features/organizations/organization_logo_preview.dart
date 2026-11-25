import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'organization_logo_upload.dart';

class OrganizationLogoPreview extends StatelessWidget {
  const OrganizationLogoPreview({
    super.key,
    required this.bytes,
    required this.width,
    required this.height,
    this.fit = BoxFit.contain,
    this.fallback,
    this.semanticLabel,
  });

  final Uint8List bytes;
  final double width;
  final double height;
  final BoxFit fit;
  final Widget? fallback;
  final String? semanticLabel;

  Widget _fallback(BuildContext context) =>
      fallback ??
      Icon(
        Icons.broken_image_outlined,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      );

  @override
  Widget build(BuildContext context) {
    if (isSafeOrganizationLogoSvg(bytes)) {
      return SvgPicture.memory(
        bytes,
        width: width,
        height: height,
        fit: fit,
        semanticsLabel: semanticLabel,
        errorBuilder: (context, error, stackTrace) => _fallback(context),
      );
    }

    if (isSupportedOrganizationLogoPayload('', bytes) &&
        (bytes.length >= 8 && bytes[0] == 0x89 ||
            bytes.length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8)) {
      return Image.memory(
        bytes,
        width: width,
        height: height,
        fit: fit,
        semanticLabel: semanticLabel,
        errorBuilder: (context, error, stackTrace) => _fallback(context),
      );
    }
    return _fallback(context);
  }
}
