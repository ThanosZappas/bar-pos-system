package gr.barlab.negroni.ui.profile

import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import gr.barlab.negroni.auth.Role
import gr.barlab.negroni.ui.theme.BarLabColors

/** The role's icon when a profile has not chosen one. Same table as functions/src/icons.ts. */
fun defaultIcon(role: Role): String = when (role) {
    Role.Admin -> "admin"
    Role.Barman -> "barman"
    Role.Server -> "person"
}

/** The icon a profile shows: its own choice if it is a known icon, else its role's default. */
fun iconOf(icon: String?, role: Role): String = icon?.takeIf { it in ProfileIconSet.ids } ?: defaultIcon(role)

/**
 * A profile's picture, or its gold line icon, in a square hairline frame (the site has no rounded
 * corners). [highlighted] frames it in gold, e.g. the selected icon in a picker.
 */
@Composable
fun ProfileAvatar(icon: String, photo: ImageBitmap?, size: Dp, modifier: Modifier = Modifier, highlighted: Boolean = false) {
    Box(
        modifier
            .size(size)
            .border(if (highlighted) 1.5.dp else 1.dp, if (highlighted) BarLabColors.Gold else BarLabColors.LineStrong)
            .clipToBounds(),
        contentAlignment = Alignment.Center,
    ) {
        if (photo != null) {
            Image(photo, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Icon(
                painterResource(ProfileIconSet.drawable(icon)),
                contentDescription = null,
                tint = BarLabColors.Gold,
                modifier = Modifier.size(size * 0.62f),
            )
        }
    }
}
