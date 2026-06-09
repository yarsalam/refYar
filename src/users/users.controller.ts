import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FilterUsersDto } from './dto/FilterUsersDto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create({ ...createUserDto });
  }

  @UseGuards(JwtAuthGuard)
  @Get('all')
  async findAllUsersExceptMe(@Req() req) {
    const users = await this.usersService.findAllUsersExceptMe(req.user.sub);
    return users;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }
  @Post('filter')
  async filterUsers(@Body() filterDto: FilterUsersDto) {
    return this.usersService.filterUsers(filterDto);
  }

  @Post('filter/count')
  async filterUsersCount(@Body() filterDto: FilterUsersDto) {
    const users = await this.usersService.filterUsers(filterDto);
    return { count: users.length };
  }

  @Get('explore')
  async exploreUsers(
    @Query('page', ParseIntPipe) page: number,
    @Query('limit', ParseIntPipe) limit: number,
  ) {
    return this.usersService.exploreUsers(page, limit);
  }

  @Get('recent-similar')
  async getRecentSimilarUsers(
    @Query('userId', ParseIntPipe) userId: number,
    @Query('limit') limit?: number,
    @Query('daysAgo') daysAgo?: number,
  ) {
    return this.usersService.findRecentSimilarUsers(
      userId,
      limit ? +limit : 5,
      daysAgo ? +daysAgo : 30,
    );
  }

  @Get('profile/:id')
  @UseGuards(JwtAuthGuard)
  async getUserProfile(@Param('id') id: number) {
    return this.usersService.findFullProfile(id);
  }

  @Patch(':id/suspend')
  @UseGuards(JwtAuthGuard)
  async suspendAccount(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.suspendAccount(id);
  }

  @Patch(':id/resign')
  @UseGuards(JwtAuthGuard)
  async resignAccount(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.resignAccount(id);
  }
}
