import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';

class DocumentStudioImageEmbedBuilder extends EmbedBuilder {
  const DocumentStudioImageEmbedBuilder();

  @override
  String get key => BlockEmbed.imageType;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final source = embedContext.node.value.data.toString();
    if (source.startsWith('data:image/')) {
      final separator = source.indexOf(',');
      if (separator < 0) return _unsupportedImage();
      try {
        final bytes = base64Decode(source.substring(separator + 1));
        return _image(
          Image.memory(
            bytes,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => _unsupportedImage(),
          ),
        );
      } on FormatException {
        return _unsupportedImage();
      }
    }
    final uri = Uri.tryParse(source);
    if (uri != null && uri.scheme == 'https') {
      return _image(
        Image.network(
          source,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => _unsupportedImage(),
        ),
      );
    }
    return _unsupportedImage();
  }

  Widget _image(Widget image) => ConstrainedBox(
    constraints: const BoxConstraints(maxWidth: 620, maxHeight: 420),
    child: image,
  );

  Widget _unsupportedImage() => const Padding(
    padding: EdgeInsets.symmetric(vertical: 8),
    child: Icon(Icons.broken_image_outlined, size: 36),
  );
}
