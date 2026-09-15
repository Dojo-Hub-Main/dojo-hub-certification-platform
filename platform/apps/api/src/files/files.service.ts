import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { RegisterFileDto } from './dto/register-file.dto';

const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // PowerPoint and Excel — course reference material is as often slides or a
  // spreadsheet as a PDF, and neither could be uploaded before.
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'text/plain',
  'application/json',
  // Images — course covers and evidence screenshots. SVG is deliberately excluded:
  // it can carry script and is served from a public bucket.
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff',
];

@Injectable()
export class FilesService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.bucket = this.configService.get<string>('s3.bucket')!;
    this.publicUrl = this.configService.get<string>('s3.publicUrl')!;
    this.s3 = new S3Client({
      endpoint: this.configService.get<string>('s3.endpoint'),
      region: this.configService.get<string>('s3.region'),
      forcePathStyle: this.configService.get<boolean>('s3.forcePathStyle'),
      credentials: {
        accessKeyId: this.configService.get<string>('s3.accessKeyId')!,
        secretAccessKey: this.configService.get<string>('s3.secretAccessKey')!,
      },
    });
  }

  async presignUpload(dto: PresignUploadDto, uploaderId: string) {
    if (dto.kind === 'VIDEO' && !dto.mimeType.startsWith('video/')) {
      throw new BadRequestException(
        'Video uploads must have a video/* mime type.',
      );
    }
    if (
      dto.kind === 'DOCUMENT' &&
      !ALLOWED_DOCUMENT_TYPES.includes(dto.mimeType)
    ) {
      throw new BadRequestException('Unsupported document file type.');
    }

    const storageKey = `${uploaderId}/${randomUUID()}-${dto.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: dto.mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 });
    const publicUrl = `${this.publicUrl}/${storageKey}`;

    return { storageKey, uploadUrl, publicUrl };
  }

  async register(dto: RegisterFileDto, uploaderId: string) {
    return this.prisma.storedFile.create({
      data: {
        url: `${this.publicUrl}/${dto.storageKey}`,
        storageKey: dto.storageKey,
        originalName: dto.originalName,
        sizeBytes: dto.sizeBytes,
        mimeType: dto.mimeType,
        kind: dto.kind,
        uploadedById: uploaderId,
        submissionId: dto.submissionId,
        topicId: dto.topicId,
      },
    });
  }
}
