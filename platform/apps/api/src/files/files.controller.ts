import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { UserRole } from '@dojo-hub/shared';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.interface';
import { FilesService } from './files.service';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { RegisterFileDto } from './dto/register-file.dto';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('presign')
  presign(@CurrentUser() user: RequestUser, @Body() dto: PresignUploadDto) {
    return this.filesService.presignUpload(dto, user.id);
  }

  @Post()
  register(@CurrentUser() user: RequestUser, @Body() dto: RegisterFileDto) {
    // Lesson reference material is shown to every student on the course, so only an
    // admin may attach a file to a topic. Without this any signed-in user could plant a
    // file in a lesson by naming its id.
    if (dto.topicId && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only administrators can add files to a lesson.');
    }
    return this.filesService.register(dto, user.id);
  }
}
