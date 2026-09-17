import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@dojo-hub/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.interface';
import { UsersService } from './users.service';
import { AdminResetPasswordDto } from './dto/reset-password.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { RoleDto } from './dto/role.dto';
import { ChangeEmailDto } from './dto/change-email.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.ADMIN)
  @Get()
  directory(@Query('role') role?: UserRole, @Query('search') search?: string) {
    return this.usersService.directory(role, search);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/suspend')
  suspend(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.usersService.suspend(actor, id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/reactivate')
  reactivate(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.usersService.reactivate(actor, id);
  }

  /** Recovery path for a user who cannot sign in — no self-service reset exists yet. */
  @Roles(UserRole.ADMIN)
  @Patch(':id/password')
  resetPassword(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
  ) {
    return this.usersService.adminResetPassword(actor, id, dto.newPassword);
  }

  /** Adds a role to an account, keeping the ones it has. */
  @Roles(UserRole.ADMIN)
  @Post(':id/roles')
  addRole(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: RoleDto,
  ) {
    return this.usersService.addRole(actor, id, dto.role);
  }

  /** Removes one role from an account, keeping the rest. */
  @Roles(UserRole.ADMIN)
  @Delete(':id/roles/:role')
  removeRole(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Param('role') role: string,
  ) {
    if (!(Object.values(UserRole) as string[]).includes(role)) {
      throw new BadRequestException('Unknown role.');
    }
    return this.usersService.removeRole(actor, id, role as UserRole);
  }

  /** Superseded by the two endpoints above; kept while pages opened before them are still in use. */
  @Roles(UserRole.ADMIN)
  @Patch(':id/role')
  changeRole(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.usersService.changeRole(actor, id, dto.role);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/email')
  changeEmail(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: ChangeEmailDto,
  ) {
    return this.usersService.changeEmail(actor, id, dto.email);
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/terminate')
  terminate(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.usersService.terminate(actor, id);
  }
}
