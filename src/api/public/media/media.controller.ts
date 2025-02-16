/*
 * SPDX-FileCopyrightText: 2022 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import {
  Controller,
  Delete,
  Headers,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { TokenAuthGuard } from '../../../auth/token.strategy';
import { PermissionError } from '../../../errors/errors';
import { ConsoleLoggerService } from '../../../logger/console-logger.service';
import { MediaUploadDto } from '../../../media/media-upload.dto';
import { MediaService } from '../../../media/media.service';
import { MulterFile } from '../../../media/multer-file.interface';
import { Note } from '../../../notes/note.entity';
import { NotesService } from '../../../notes/notes.service';
import { User } from '../../../users/user.entity';
import { OpenApi } from '../../utils/openapi.decorator';
import { RequestUser } from '../../utils/request-user.decorator';

@UseGuards(TokenAuthGuard)
@OpenApi(401)
@ApiTags('media')
@ApiSecurity('token')
@Controller('media')
export class MediaController {
  constructor(
    private readonly logger: ConsoleLoggerService,
    private mediaService: MediaService,
    private noteService: NotesService,
  ) {
    this.logger.setContext(MediaController.name);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiHeader({
    name: 'HedgeDoc-Note',
    description: 'ID or alias of the parent note',
  })
  @OpenApi(
    {
      code: 201,
      description: 'The file was uploaded successfully',
      dto: MediaUploadDto,
    },
    400,
    403,
    404,
    500,
  )
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @RequestUser() user: User,
    @UploadedFile() file: MulterFile,
    @Headers('HedgeDoc-Note') noteId: string,
  ): Promise<MediaUploadDto> {
    // TODO: Move getting the Note object into a decorator
    const note: Note = await this.noteService.getNoteByIdOrAlias(noteId);
    this.logger.debug(
      `Recieved filename '${file.originalname}' for note '${noteId}' from user '${user.username}'`,
      'uploadMedia',
    );
    const upload = await this.mediaService.saveFile(file.buffer, user, note);
    return await this.mediaService.toMediaUploadDto(upload);
  }

  @Delete(':filename')
  @OpenApi(204, 403, 404, 500)
  async deleteMedia(
    @RequestUser() user: User,
    @Param('filename') filename: string,
  ): Promise<void> {
    const username = user.username;
    this.logger.debug(
      `Deleting '${filename}' for user '${username}'`,
      'deleteMedia',
    );
    const mediaUpload = await this.mediaService.findUploadByFilename(filename);
    if ((await mediaUpload.user).username !== username) {
      this.logger.warn(
        `${username} tried to delete '${filename}', but is not the owner`,
        'deleteMedia',
      );
      throw new PermissionError(
        `File '${filename}' is not owned by '${username}'`,
      );
    }
    await this.mediaService.deleteFile(mediaUpload);
  }
}
